using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;
using UnityEngine.UI.Extensions;
using ZetPDF.Pdf.Content.Objects;

public class ConnectorsLogic : MonoBehaviour
{
	#region variables
	[SerializeField] RPDComponent reciprocatingPlateComponent;
	[SerializeField] RPDComponent anteriorCingulumFullRestComponent;

	public static ConnectorsLogic instance;

	public Transform BtmMajor, BtmMinor, TopMajor, TopMinor;

	public UnityEvent Error;

	public GameObject PalatalBarGO;
	public GameObject PalatalStrapGO;
	public GameObject AnteriorStrapGO;

	public List<GameObject> PlateGOList = new List<GameObject>();

	public List<GameObject> UpperBallRet = new List<GameObject>();
	public List<GameObject> LowerBallRet = new List<GameObject>();

	public RPD_2DComponent.componentType upperMajorConnectorType = RPD_2DComponent.componentType.no_mc_upper_jaw;
	public RPD_2DComponent.componentType lowerMajorConnectorType = RPD_2DComponent.componentType.no_mc_lower_jaw;

	public bool[] upperMinorConnectorActive = new bool[17];
	public bool[] lowerMinorConnectorActive = new bool[17];

	[SerializeField]
	[Tooltip("Must be in universal ID order")]
	RoundedConnectorSpriteChanger[] upperMajorSpriteChangers;

	[SerializeField]
	[Tooltip("Must be in universal ID order")]
	RoundedConnectorSpriteChanger[] lowerMajorSpriteChangers;

	[SerializeField]
	[Tooltip("Must be in universal ID order")]
	RoundedConnectorSpriteChanger[] upperMinorSpriteChangers;

	[SerializeField]
	[Tooltip("Must be in universal ID order")]
	RoundedConnectorSpriteChanger[] lowerMinorSpriteChangers;

	public event System.Action<Jaw_Type> OnMajorConnectorPlaced;
	public event System.Action<Jaw_Type> OnMajorConnectorRemoved;

	public int Upper_Start;
	public int Upper_End;

	public int Lower_Start;
	public int Lower_End;

	public Toggle toggleAcrylic;
	public Toggle toggleMetal;
	#endregion

	private void Awake()
	{
		if (instance == null)
			instance = this;
		else
			Destroy(this);
	}

	// Start is called before the first frame update
	void Start()
	{
		Debug.Log("Major connector START FUNCTION CALLED");
		ClearAllBtm(false);
		ClearAllTop(false);
		UI_StageProgressor.instance.ConnectorLogicStarted = true;

		if (toggleAcrylic != null)
			Debug.Log($"Acrylic Toggle Active: {toggleAcrylic.isActiveAndEnabled}");
		if (toggleMetal != null)
			Debug.Log($"Metal Toggle Active: {toggleMetal.isActiveAndEnabled}");
	}

	void Update()
	{
		//Debug.Log($"Acrylic Toggle isOn: {toggleAcrylic.isOn}");
		//Debug.Log($"Metal Toggle isOn: {toggleMetal.isOn}");
	}

	private void OnDisable() { UI_StageProgressor.instance.ConnectorLogicStarted = false; }

	/// <summary>
	/// Used by UndoRedo event
	/// Depending on the currently set major connector, it will re-call the relevant major connector function to place it back again
	/// </summary>
	public void ReSetMajorConnectorForUndoRedo()
	{
		//UpperJaw switch case
		switch (upperMajorConnectorType)
		{
			case RPD_2DComponent.componentType.mc_palatal_strap:
				PalStrapNoPlates();
				break;

			case RPD_2DComponent.componentType.mc_palatal_bar:
				PalBarNoPlates();
				break;

			case RPD_2DComponent.componentType.mc_horseshoe:
				HorseshoeNoPlates();
				break;

			case RPD_2DComponent.componentType.mc_hole:
				HoleNoPlates();
				break;

			case RPD_2DComponent.componentType.mc_palatal_full_plate:
				PalPlatesNoPlates();
				break;

			default:
				//error handle as type isn't being covered
				Debug.LogError("Unable to re set Upper Major Connector type as it is not covered.");
				break;
		}

		//LowerJaw switch case
		switch (lowerMajorConnectorType)
		{
			case RPD_2DComponent.componentType.mc_lingual_bar:
				LingualBarReset();
				break;

			case RPD_2DComponent.componentType.mc_lingual_plate:
				LingualPlateNoPlate();
				break;

			default:
				//error handle as type isn't being covered
				Debug.LogError("Unable to re set Lower Major Connector type as it is not covered.");
				break;
		}
	}

	#region Round Connectors
	public void ApplyConnectorsToJaws()
	{
		if (DLLIntegration.instance.upperJawPresent)
		{
			DLLIntegration.instance.SetJawComponent(upperMajorConnectorType, true);
		}

		if (DLLIntegration.instance.lowerJawPresent)
		{
			DLLIntegration.instance.SetJawComponent(lowerMajorConnectorType, false);
		}
	}

	[ContextMenu("round upper")]
	public void RoundUpperJawConnectors()
	{
		print("rounding upper minor connectors");
		RoundConnectors(Jaw_Type.upper_jaw);
	}

	[ContextMenu("round lower")]
	public void RoundLowerJawConnectors()
	{
		print("rounding lower minor connectors");
		RoundConnectors(Jaw_Type.lower_jaw);
	}

	public void RoundConnectors(Jaw_Type jawType)
	{
		RoundedConnectorSpriteChanger[] majorSpriteChangers;

		switch (jawType)
		{
			case Jaw_Type.upper_jaw:
				majorSpriteChangers = upperMajorSpriteChangers;
				break;
			case Jaw_Type.lower_jaw:
				majorSpriteChangers = lowerMajorSpriteChangers;
				break;
			default:
				Debug.LogError($"Unable to round connectors. Unhandled jaw type of {jawType}");
				return;
		}

		bool prevPosHasMajorConnector = false;
		List<System.Tuple<RoundedConnectorSpriteChanger, RoundedConnectorSpriteChanger>> connectorSpans =
			new List<System.Tuple<RoundedConnectorSpriteChanger, RoundedConnectorSpriteChanger>>();

		RoundedConnectorSpriteChanger newSpanStart = null;

		for (int i = 0; i < majorSpriteChangers.Length; i++)
		{
			//determine start and end of each grouping of major connectors
			RoundedConnectorSpriteChanger majorConnectorSpriteChanger = majorSpriteChangers[i];

			bool majorConnectorPresent = majorConnectorSpriteChanger.gameObject.activeInHierarchy;

			if (majorConnectorPresent)
			{
				if (!prevPosHasMajorConnector)
				{
					//found span start
					newSpanStart = majorConnectorSpriteChanger;
					prevPosHasMajorConnector = true;
					continue;
				}
				else
				{
					//check if is last
					if (i == majorSpriteChangers.Length - 1)
					{
						//is last, this is end of span
						System.Tuple<RoundedConnectorSpriteChanger, RoundedConnectorSpriteChanger> newSpan =
							new System.Tuple<RoundedConnectorSpriteChanger, RoundedConnectorSpriteChanger>(newSpanStart, majorConnectorSpriteChanger);

						connectorSpans.Add(newSpan);
						continue;
					}
					prevPosHasMajorConnector = true;
					continue;
				}
			}
			else
			{
				if (!prevPosHasMajorConnector)
				{
					prevPosHasMajorConnector = false;
					continue;
				}
				else
				{
					//found span end = i - 1
					System.Tuple<RoundedConnectorSpriteChanger, RoundedConnectorSpriteChanger> newSpan =
						new System.Tuple<RoundedConnectorSpriteChanger, RoundedConnectorSpriteChanger>(newSpanStart, majorSpriteChangers[i - 1]);

					connectorSpans.Add(newSpan);

					prevPosHasMajorConnector = false;
					continue;
				}
			}
		}

		//reset the connector sprites to their unrounded state
		UnroundConnectorSprites(majorSpriteChangers);

		//round the ones required to be rounded
		RoundConnectorSprites(jawType, connectorSpans);
	}

	void UnroundConnectorSprites(RoundedConnectorSpriteChanger[] roundedConnectorSpriteChangers)
	{
		for (int i = 0; i < roundedConnectorSpriteChangers.Length; i++)
		{
			roundedConnectorSpriteChangers[i].SetRounding(RoundedConnectorSpriteChanger.RoundedEnds.None);
		}
	}

	void RoundConnectorSprites(Jaw_Type jawType, List<System.Tuple<RoundedConnectorSpriteChanger, RoundedConnectorSpriteChanger>> majorConnectorSpans)
	{
		foreach (System.Tuple<RoundedConnectorSpriteChanger, RoundedConnectorSpriteChanger> span in majorConnectorSpans)
		{
			//round minor connectors
			System.Tuple<RoundedConnectorSpriteChanger, RoundedConnectorSpriteChanger> spanMinorConnectors = GetSpanMinorConnectors(jawType, span);
			int minorConnectorIndex1 = GetMinorConnectorIndex(jawType, spanMinorConnectors.Item1);
			int minorConnectorIndex2 = GetMinorConnectorIndex(jawType, spanMinorConnectors.Item2);

			if (minorConnectorIndex1 < minorConnectorIndex2)
			{
				if (jawType == Jaw_Type.upper_jaw)
				{
					//index 1 = left, 2 = right
					spanMinorConnectors.Item1.SetRounding(RoundedConnectorSpriteChanger.RoundedEnds.Left);
					spanMinorConnectors.Item2.SetRounding(RoundedConnectorSpriteChanger.RoundedEnds.Right);
				}
				else
				{
					//index 2 = left, 1 = right
					spanMinorConnectors.Item1.SetRounding(RoundedConnectorSpriteChanger.RoundedEnds.Right);
					spanMinorConnectors.Item2.SetRounding(RoundedConnectorSpriteChanger.RoundedEnds.Left);
				}
			}
			else //index 1 more than index 2
			{
				if (jawType == Jaw_Type.upper_jaw)
				{
					//index 2 = left, 1 = right
					spanMinorConnectors.Item1.SetRounding(RoundedConnectorSpriteChanger.RoundedEnds.Right);
					spanMinorConnectors.Item2.SetRounding(RoundedConnectorSpriteChanger.RoundedEnds.Left);
				}
				else
				{
					//index 1 = left, 2 = right
					spanMinorConnectors.Item1.SetRounding(RoundedConnectorSpriteChanger.RoundedEnds.Left);
					spanMinorConnectors.Item2.SetRounding(RoundedConnectorSpriteChanger.RoundedEnds.Right);
				}
			}

			//round major connectors
			int majorConnectorIndex1 = GetMajorConnectorIndex(jawType, span.Item1);
			int majorConnectorIndex2 = GetMajorConnectorIndex(jawType, span.Item2);

			if (majorConnectorIndex1 < majorConnectorIndex2)
			{
				if (jawType == Jaw_Type.upper_jaw)
				{
					//index 1 = left, 2 = right
					span.Item1.SetRounding(RoundedConnectorSpriteChanger.RoundedEnds.Left);
					span.Item2.SetRounding(RoundedConnectorSpriteChanger.RoundedEnds.Right);
				}
				else
				{
					//index 2 = left, 1 = right
					span.Item1.SetRounding(RoundedConnectorSpriteChanger.RoundedEnds.Right);
					span.Item2.SetRounding(RoundedConnectorSpriteChanger.RoundedEnds.Left);
				}
			}
			else if (majorConnectorIndex1 > majorConnectorIndex2)
			{
				if (jawType == Jaw_Type.upper_jaw)
				{
					//index 2 = left, 1 = right
					span.Item1.SetRounding(RoundedConnectorSpriteChanger.RoundedEnds.Right);
					span.Item2.SetRounding(RoundedConnectorSpriteChanger.RoundedEnds.Left);
				}
				else
				{
					//index 1 = left, 2 = right
					span.Item1.SetRounding(RoundedConnectorSpriteChanger.RoundedEnds.Left);
					span.Item2.SetRounding(RoundedConnectorSpriteChanger.RoundedEnds.Right);
				}
			}
			else //majorConnectorIndex1 == majorConnectorIndex2
			{
				span.Item1.SetRounding(RoundedConnectorSpriteChanger.RoundedEnds.Both);
			}
		}
	}
	#endregion

	System.Tuple<RoundedConnectorSpriteChanger, RoundedConnectorSpriteChanger> GetSpanMinorConnectors(Jaw_Type jawType, System.Tuple<RoundedConnectorSpriteChanger, RoundedConnectorSpriteChanger> span)
	{
		RoundedConnectorSpriteChanger[] minorSpriteChangers;

		switch (jawType)
		{
			case Jaw_Type.upper_jaw:
				minorSpriteChangers = upperMinorSpriteChangers;
				break;
			case Jaw_Type.lower_jaw:
				minorSpriteChangers = lowerMinorSpriteChangers;
				break;
			default:
				Debug.LogError($"Unable to round connectors. Unhandled jaw type of {jawType}");
				return null;
		}

		int majorConnectorIndex1 = GetMajorConnectorIndex(jawType, span.Item1);
		int majorConnectorIndex2 = GetMajorConnectorIndex(jawType, span.Item2);

		int lowerIndex;
		int higherIndex;

		if (majorConnectorIndex1 < majorConnectorIndex2)
		{
			lowerIndex = majorConnectorIndex1;
			higherIndex = majorConnectorIndex2;
		}
		else
		{
			lowerIndex = majorConnectorIndex2;
			higherIndex = majorConnectorIndex1;
		}

		System.Tuple<RoundedConnectorSpriteChanger, RoundedConnectorSpriteChanger> result =
			new System.Tuple<RoundedConnectorSpriteChanger, RoundedConnectorSpriteChanger>(minorSpriteChangers[lowerIndex], minorSpriteChangers[higherIndex + 1]);
		return result;
	}

	int GetMajorConnectorIndex(Jaw_Type jawType, RoundedConnectorSpriteChanger majorConnector)
	{
		RoundedConnectorSpriteChanger[] majorSpriteChangers;

		switch (jawType)
		{
			case Jaw_Type.upper_jaw:
				majorSpriteChangers = upperMajorSpriteChangers;
				break;
			case Jaw_Type.lower_jaw:
				majorSpriteChangers = lowerMajorSpriteChangers;
				break;
			default:
				Debug.LogError($"Unable to round connectors. Unhandled jaw type of {jawType}");
				return -1;
		}

		for (int i = 0; i < majorSpriteChangers.Length; i++)
		{
			if (majorConnector == majorSpriteChangers[i])
				return i;
		}

		Debug.LogError($"Unable to find index of major connector for jaw {jawType}");
		return -1;
	}

	int GetMinorConnectorIndex(Jaw_Type jawType, RoundedConnectorSpriteChanger minorConnector)
	{
		RoundedConnectorSpriteChanger[] minorSpriteChangers;

		switch (jawType)
		{
			case Jaw_Type.upper_jaw:
				minorSpriteChangers = upperMinorSpriteChangers;
				break;
			case Jaw_Type.lower_jaw:
				minorSpriteChangers = lowerMinorSpriteChangers;
				break;
			default:
				Debug.LogError($"Unable to round connectors. Unhandled jaw type of {jawType}");
				return -1;
		}

		for (int i = 0; i < minorSpriteChangers.Length; i++)
		{
			if (minorConnector == minorSpriteChangers[i])
				return i;
		}

		Debug.LogError($"Unable to find index of minor connector for jaw {jawType}");
		return -1;
	}

	#region Lower Jaw Connector
	public bool isLingualBar = false;

	/// <summary>
	///  Set Major Connector to Lingual Bar type.
	///	Used by UI button to set this Major Connector Type.
	/// </summary>
	/// <param name="isOn"></param>
	public void LingualBar(bool isOn)
	{
		if (isOn)
		{
			ClearAllBtm();
			SetLingualMajor(false, true);
			isLingualBar = true;
			isLingualPlate = false;

			lowerMajorConnectorType = RPD_2DComponent.componentType.mc_lingual_bar;

			RoundLowerJawConnectors();

			OnMajorConnectorPlaced?.Invoke(Jaw_Type.lower_jaw);
		}
		else
		{
			ClearAllBtm();
			isLingualBar = false;
		}
	}

	/// <summary>
	/// Set Major Connector to Lingual Bar type.
	/// Only to be used by script, meant for the re-setting of this Major Connector Type.
	/// </summary>
	void LingualBarReset()
	{
		print("Setting Lingual bar");
		ClearAllBtm();
		SetLingualMajor(false, false);
		isLingualBar = true;
		isLingualPlate = false;

		lowerMajorConnectorType = RPD_2DComponent.componentType.mc_lingual_bar;

		RoundLowerJawConnectors();
	}

	public bool isLingualPlate = false;
	/// <summary>
	/// Set Major Connector to Lingual Plate type.
	///	Used by UI button to set this Major Connector Type.
	/// </summary>
	/// <param name="isOn"></param>
	public void LingualPlate(bool isOn)
	{
		if (isOn)
		{
			print("setting lingual plates");
			ClearAllBtm();
			SetLingualMajor(true);
			isLingualPlate = true;
			isLingualBar = false;

			lowerMajorConnectorType = RPD_2DComponent.componentType.mc_lingual_plate;

			RoundLowerJawConnectors();

			OnMajorConnectorPlaced?.Invoke(Jaw_Type.lower_jaw);
		}
		else
		{
			ClearAllBtm();
			isLingualPlate = false;
		}
	}

	/// <summary>
	/// Set Major Connector to Lingual Plate type.
	/// Only to be used by script, meant for the re-setting of this Major Connector Type.
	/// </summary>
	public void LingualPlateNoPlate()
	{
		print("not forcing placement of plates, is reset. To prevent auto replacement of any user placed Recip. Clasps");
		ClearAllBtm();
		SetLingualMajor(true, false);
		isLingualPlate = true;
		isLingualBar = false;

		lowerMajorConnectorType = RPD_2DComponent.componentType.mc_lingual_plate;

		RoundLowerJawConnectors();

		OnMajorConnectorPlaced?.Invoke(Jaw_Type.lower_jaw);
	}

	[ContextMenu("ClearBtm")]
	public void ClearAllBtm(bool invokeEvent = true)
	{
		//ResetMajorConnectorBools();
		print("CLEARING LOWER MajConnector");
		if (BtmMajor != null)
			foreach (Transform obj in BtmMajor.transform)
			{
				obj.gameObject.SetActive(false);
			}

		if (BtmMinor != null)
			foreach (Transform obj in BtmMinor.transform)
			{
				obj.gameObject.SetActive(false);
			}

		/*foreach (GameObject go in LowerBallRet)
        {
            go.SetActive(false);
        }*/

		lowerMajorConnectorType = RPD_2DComponent.componentType.no_mc_lower_jaw;
		lowerMinorConnectorActive = new bool[17];

		if (invokeEvent)
			OnMajorConnectorRemoved?.Invoke(Jaw_Type.lower_jaw);
	}

	public void ClearLowerBallRet()
	{
		if (LowerBallRet != null)
			foreach (GameObject go in LowerBallRet)
			{
				go.SetActive(false);
			}
	}

	void SetLingualMajor(bool isSetPlate = false, bool isNotReset = true)
	{
		GameObject BtmJaw = BarLogic.instance.BtmJaw;

		bool isStartFound = false;

		int LastKnownSet = 0;

		//check left
		for (int i = 0; i < 8; i++)
		{
			int num = BarLogic.instance.LowerList[i];
			ConnectorData data = BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().GetConnectorData();

			CheckToothComponentDirection(data);

			if (!isStartFound && data.presence) // tooth presence
			{
				if (data.isComponentPresent) //component ruleset states that Connectors end at highest counted tooth WITH a component, only exception is anterior teeth
				{
					// Check if tooth should be excluded from major connectors
					bool toothIncluded = !IsToothExcludedFromMajorConnector(num);
					if (toothIncluded)
					{
						if (EndConnectorAtMesial)
							BtmMajor.transform.Find((num - 1).ToString()).gameObject.SetActive(true);
						else
							BtmMajor.transform.Find(num.ToString()).gameObject.SetActive(true);
					}

					if (isSetPlate && isNotReset)//Type is Lingual Plate, force the system to set a recip.Plate if there is none on Anterior Tooth
					{
						GenericTooth tooth = BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>();
						bool hasReciprocatingClasp = tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_clasp)
													|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distobuccal)
													|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distolingual)
													|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiobuccal)
													|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiolingual);

						print("Tooth" + num + " || has plate: " + tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_plate));

						if (!hasReciprocatingClasp && !tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_plate))
						{
							print("Set plate on tooth ID " + num);

							if (RPDManager.instance.useNew2DSystem)
								RPDManager.instance.PlaceComponent(reciprocatingPlateComponent, num, out CriteriaFailureData failureData, false);
							else
								BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.reciprocating_plate);
						}

						if (num == 41 || num == 31 || num == 42 || num == 32 || num == 43 || num == 33)
						{
							print("Tooth" + num + " || has plate: " + tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_plate));

							//recalculate value
							hasReciprocatingClasp = tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_clasp)
													|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distobuccal)
													|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distolingual)
													|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiobuccal)
													|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiolingual);

							if (!hasReciprocatingClasp && !tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_plate))
							{
								print("Set plate on tooth ID " + num);

								if (RPDManager.instance.useNew2DSystem)
									RPDManager.instance.PlaceComponent(reciprocatingPlateComponent, num, out CriteriaFailureData failureData, false);
								else
									BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.reciprocating_plate);
							}

							//force to also set a Ant.Cingulum Full Rest if there is none on Anterior Tooth
							//NOW REQUESTED TO DISABLE IT
							/*if (!BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.ac_full))
							{
								if (RPDManager.instance.useNew2DSystem)
									RPDManager.instance.PlaceComponent(anteriorCingulumFullRestComponent, num, out CriteriaFailureData failureData, false);
								else
									BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.ac_full);
							}*/
						}
					}

					if (!isSetPlate && isNotReset)
						ClearAllAnteriorToothComponents(false, false);

					//check minor connector
					SetMinorConnectors(false, num, data);

					// Only set LastKnownSet if the tooth is actually included in major connector
					if (toothIncluded && LastKnownSet == 0)
						LastKnownSet = num;

					isStartFound = true;
				}

				else
				{
					if (isSetPlate && isNotReset)
					{
						if (num == 41 || num == 31 || num == 42 || num == 32 || num == 43 || num == 33)
						{
							GenericTooth tooth = BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>();
							bool hasReciprocatingClasp = tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_clasp)
														|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distobuccal)
														|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distolingual)
														|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiobuccal)
														|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiolingual);

							print("Tooth" + num + " || has plate: " + tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_plate));

							if (!hasReciprocatingClasp && !tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_plate))
							{
								print("Set plate on tooth ID " + num);

								if (RPDManager.instance.useNew2DSystem)
									RPDManager.instance.PlaceComponent(reciprocatingPlateComponent, num, out CriteriaFailureData failureData, false);
								else
									BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.reciprocating_plate);
							}

							//force to also set a Ant.Cingulum Full Rest if there is none on Anterior Tooth
							//NOW REQUESTED TO DISABLE IT
							/*if (!BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.ac_full))
							{
								if (RPDManager.instance.useNew2DSystem)
									RPDManager.instance.PlaceComponent(anteriorCingulumFullRestComponent, num, out CriteriaFailureData failureData, false);
								else
									BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.ac_full);
							}*/
						}

						isStartFound = true;
					}

					//if (!data.isMesh)
					//{
					//	int num2 = BarLogic.instance.LowerList[i + 1];
					//	//check next for mesh
					//	ConnectorData data2 = BtmJaw.transform.Find(num2.ToString()).GetChild(0).GetComponent<GenericTooth>().GetConnectorData();
					//	if (data2.isMesh)
					//	{
					//		SetMinorConnectors(false, num2, data2);
					//	}
					//}
				}

				//isStartFound = true;
			}

			else if (!isStartFound && !data.presence)
			{
				if (data.isMesh)
				{
					if (BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.tori_mesh))
						continue;
					else if (!IsToothExcludedFromMajorConnector(num))
						BtmMajor.transform.Find(num.ToString()).gameObject.SetActive(true);

					//find minor connector from mesh data

					if (LastKnownSet == 0)
						LastKnownSet = num;

					isStartFound = true;
				}
			}
			else if (isStartFound)
			{
				//if (EndConnectorAtMesial)
				//	BtmMajor.transform.Find((num - 1).ToString()).gameObject.SetActive(true);
				//else
				//	BtmMajor.transform.Find(num.ToString()).gameObject.SetActive(true);

				if (data.isMesh && BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.tori_mesh))
					continue;
				else if (!IsToothExcludedFromMajorConnector(num))
				{
					BtmMajor.transform.Find(num.ToString()).gameObject.SetActive(true);

					// Only set LastKnownSet if the tooth is actually included in major connector
					if (LastKnownSet == 0)
						LastKnownSet = num;
				}

				//set plate when teeth is present without component
				if (isSetPlate && data.presence && !data.isMesh && isNotReset)
				{
					print("Tooth" + num + " || has plate: " + BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.reciprocating_plate));

					if (num == 41 || num == 31 || num == 42 || num == 32 || num == 43 || num == 33)
					{
						//NOW REQUESTED TO DISABLE IT
						/*if (!BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.ac_full))
						{
							if (RPDManager.instance.useNew2DSystem)
								RPDManager.instance.PlaceComponent(anteriorCingulumFullRestComponent, num, out CriteriaFailureData failureData, false);
							else
								BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.ac_full);
						}*/
					}

					GenericTooth tooth = BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>();
					bool hasReciprocatingClasp = tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_clasp)
												|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distobuccal)
												|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distolingual)
												|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiobuccal)
												|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiolingual);

					if (!hasReciprocatingClasp && !tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_plate))
					{
						print("Set plate on tooth ID " + num);

						if (RPDManager.instance.useNew2DSystem)
							RPDManager.instance.PlaceComponent(reciprocatingPlateComponent, num, out CriteriaFailureData failureData, false);
						else
							BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.reciprocating_plate);
					}
				}

				//if (!data.isMesh)
				//{
				//	int num2 = BarLogic.instance.LowerList[i + 1];
				//	//check next for mesh
				//	ConnectorData data2 = BtmJaw.transform.Find(num2.ToString()).GetChild(0).GetComponent<GenericTooth>().GetConnectorData();
				//	if (data2.isMesh)
				//	{
				//		SetMinorConnectors(false, num2, data2);
				//	}
				//}

				if (data.isComponentPresent)
				{
					//print(BtmMinor.transform.Find((num - 1).ToString()).gameObject);

					if (isSetPlate && !data.isMesh && isNotReset)//data.presence && isSetPlate 
					{
						print("Tooth" + num + " || has plate: " + BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.reciprocating_plate));

						GenericTooth tooth = BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>();
						bool hasReciprocatingClasp = tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_clasp)
													|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distobuccal)
													|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distolingual)
													|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiobuccal)
													|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiolingual);

						if (!hasReciprocatingClasp && !tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_plate))
						{
							print("Set plate on tooth ID " + num);

							if (RPDManager.instance.useNew2DSystem)
								RPDManager.instance.PlaceComponent(reciprocatingPlateComponent, num, out CriteriaFailureData failureData, false);
							else
								BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.reciprocating_plate);
						}

						if (num == 41 || num == 31 || num == 42 || num == 32 || num == 43 || num == 33)
						{
							//NOW REQUESTED TO DISABLE IT
							/*if (!BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.ac_full))
							{
								if (RPDManager.instance.useNew2DSystem)
									RPDManager.instance.PlaceComponent(anteriorCingulumFullRestComponent, num, out CriteriaFailureData failureData, false);
								else
									BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.ac_full);
							}*/
						}
					}

					if (!isSetPlate && isNotReset)
						ClearAllAnteriorToothComponents(false, false);

					//check minor connector
					SetMinorConnectors(false, num, data);

				}
				else if (data.isMesh)
				{
					Debug.LogError("MESH");
				}
			}


		}
		if (isStartFound == false)
		{
			// nth to set, no such case, reset
			Debug.LogError("No Such Connector Case");

			if (Error != null)
				Error.Invoke();

			ClearAllBtm();
			return;
		}
		//end index comes 1st because it's on the "left" side of the template
		// Lower_End = LastKnownSet;

		isStartFound = false; // recheck start
		LastKnownSet = 0;

		//check right
		for (int i = 15; i > 7; i--)
		{
			int num = BarLogic.instance.LowerList[i];
			ConnectorData data = BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().GetConnectorData();

			CheckToothComponentDirection(data);

			if (!isStartFound && data.presence) // tooth presence
			{
				if (data.isComponentPresent)
				{
					// Check if tooth should be excluded from major connectors
					bool toothIncluded = !IsToothExcludedFromMajorConnector(num);
					if (toothIncluded)
					{
						if (EndConnectorAtMesial)
							BtmMajor.transform.Find((num - 1).ToString()).gameObject.SetActive(true);
						else
							BtmMajor.transform.Find(num.ToString()).gameObject.SetActive(true);
					}

					if (isSetPlate && !data.isMesh && isNotReset)
					{
						if (num == 41 || num == 31 || num == 42 || num == 32 || num == 43 || num == 33)
						{
							print("Tooth" + num + " || has plate: " + BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.reciprocating_plate));

							if (!BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.ac_full))
							{
								//NOW REQUESTED TO DISABLE IT
								/*if (RPDManager.instance.useNew2DSystem)
									RPDManager.instance.PlaceComponent(anteriorCingulumFullRestComponent, num, out CriteriaFailureData failureData, false);
								else
									BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.ac_full);*/
							}
						}

						GenericTooth tooth = BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>();
						bool hasReciprocatingClasp = tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_clasp)
													|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distobuccal)
													|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distolingual)
													|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiobuccal)
													|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiolingual);

						if (!hasReciprocatingClasp && !tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_plate))
						{
							print("Set plate on tooth ID " + num + " right side check");

							if (RPDManager.instance.useNew2DSystem)
								RPDManager.instance.PlaceComponent(reciprocatingPlateComponent, num, out CriteriaFailureData failureData, false);
							else
								BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.reciprocating_plate);
						}
					}

					//if (isSetPlate)
					//{
					//	print("Tooth" + num + " || has plate: " + BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.reciprocating_plate));

					//	if (!BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.reciprocating_clasp) &&
					//		!BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.reciprocating_plate) &&
					//		isNotReset)
					//	{
					//		print("Set plate on tooth ID " + num);

					//		if (RPDManager.instance.useNew2DSystem)
					//			RPDManager.instance.PlaceComponent(reciprocatingPlateComponent, num, out CriteriaFailureData failureData, false);
					//		else
					//			BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.reciprocating_plate);
					//	}
					//}

					if (!isSetPlate && isNotReset)
						ClearAllAnteriorToothComponents(false, false);

					//check minor connector
					SetMinorConnectors(false, num, data);

					// Only set LastKnownSet if the tooth is actually included in major connector
					if (toothIncluded && LastKnownSet == 0)
						LastKnownSet = num;

					isStartFound = true;
				}

				//component ruleset states that Connectors end at highest counted tooth WITH a component, only exception is anterior teeth
				else
				{
					if (isSetPlate && isNotReset) //&& !data.isMesh 
					{
						if (num == 41 || num == 31 || num == 42 || num == 32 || num == 43 || num == 33)
						{
							if (!BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.ac_full))
							{
								//NOW REQUESTED TO DISABLE IT
								/*if (RPDManager.instance.useNew2DSystem)
									RPDManager.instance.PlaceComponent(anteriorCingulumFullRestComponent, num, out CriteriaFailureData failureData, false);
								else
									BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.ac_full);*/
							}

							GenericTooth tooth = BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>();
							bool hasReciprocatingClasp = tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_clasp)
														|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distobuccal)
														|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distolingual)
														|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiobuccal)
														|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiolingual);

							print("Tooth" + num + " || has plate: " + tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_plate));

							if (!hasReciprocatingClasp && !tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_plate))
							{
								print("Set plate on tooth ID " + num + " right side check");

								if (RPDManager.instance.useNew2DSystem)
									RPDManager.instance.PlaceComponent(reciprocatingPlateComponent, num, out CriteriaFailureData failureData, false);
								else
									BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.reciprocating_plate);
							}
						}

						isStartFound = true;
					}
				}

				//if (!data.isMesh)
				//{
				//	int num2 = BarLogic.instance.LowerList[i - 1];
				//	//check next for mesh
				//	ConnectorData data2 = BtmJaw.transform.Find(num2.ToString()).GetChild(0).GetComponent<GenericTooth>().GetConnectorData();
				//	if (data2.isMesh)
				//	{
				//		SetMinorConnectors(false,num2, data2);
				//	}
				//}

				//isStartFound = true;
			}
			else if (!isStartFound && !data.presence)
			{
				if (data.isMesh)
				{
					if (BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.tori_mesh))
						continue;
					else if (!IsToothExcludedFromMajorConnector(num))
					{
						BtmMajor.transform.Find(num.ToString()).gameObject.SetActive(true);

						//find minor connector from mesh data
						if (LastKnownSet == 0)
							LastKnownSet = num;
					}

					isStartFound = true;
				}
			}
			else if (isStartFound)
			{
				if (data.isMesh && BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.tori_mesh))
					continue;
				else if (!IsToothExcludedFromMajorConnector(num))
				{
					BtmMajor.transform.Find(num.ToString()).gameObject.SetActive(true);

					// Only set LastKnownSet if the tooth is actually included in major connector
					if (LastKnownSet == 0)
						LastKnownSet = num;
				}
				//if (EndConnectorAtMesial)
				//	BtmMajor.transform.Find((num - 1).ToString()).gameObject.SetActive(true);
				//else
				//	BtmMajor.transform.Find(num.ToString()).gameObject.SetActive(true);
				LastKnownSet = num;

				if (isSetPlate && !data.isMesh && data.presence && isNotReset)
				{
					print("Tooth" + num + " || has plate: " + BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.reciprocating_plate));

					GenericTooth tooth = BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>();

					bool hasReciprocatingClasp = tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_clasp)
						|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distobuccal)
						|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distolingual)
						|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiobuccal)
						|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiolingual);

					if (!hasReciprocatingClasp && !tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_plate))
					{
						print("Set plate on tooth ID " + num + " right side check");

						if (RPDManager.instance.useNew2DSystem)
							RPDManager.instance.PlaceComponent(reciprocatingPlateComponent, num, out CriteriaFailureData failureData, false);
						else
							BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.reciprocating_plate);
					}

					if (num == 41 || num == 31 || num == 42 || num == 32 || num == 43 || num == 33)
					{
						if (!BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.ac_full))
						{
							//NOW REQUESTED TO DISABLE IT
							/*if (RPDManager.instance.useNew2DSystem)
								RPDManager.instance.PlaceComponent(anteriorCingulumFullRestComponent, num, out CriteriaFailureData failureData, false);
							else
								BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.ac_full);*/
						}
					}
				}

				//set plate when teeth is present without component
				//if (data.presence && isSetPlate)
				//{
				//	print("Tooth" + num + " || has plate: " + BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.reciprocating_plate));

				//	if (!BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.reciprocating_clasp) &&
				//		!BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.reciprocating_plate) &&
				//		isNotReset)
				//	{
				//		print("Set plate on tooth ID " + num + " right side check");

				//		if (RPDManager.instance.useNew2DSystem)
				//			RPDManager.instance.PlaceComponent(reciprocatingPlateComponent, num, out CriteriaFailureData failureData, false);
				//		else
				//			BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.reciprocating_plate);
				//	}
				//}

				//if (!data.isMesh)
				//{
				//	int num2 = BarLogic.instance.LowerList[i - 1];
				//	//check next for mesh
				//	ConnectorData data2 = BtmJaw.transform.Find(num2.ToString()).GetChild(0).GetComponent<GenericTooth>().GetConnectorData();
				//	if (data2.isMesh)
				//	{
				//		SetMinorConnectors(false, num2, data2);
				//	}
				//}

				if (data.isComponentPresent)
				{
					//if (data.presence && isSetPlate)
					//{
					//	print("Tooth" + num + " || has plate: " + BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.reciprocating_plate));

					//	if (!BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.reciprocating_clasp) &&
					//		!BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.reciprocating_plate) &&
					//		isNotReset)
					//	{
					//		print("Set plate on tooth ID " + num + " right side check");

					//		if (RPDManager.instance.useNew2DSystem)
					//			RPDManager.instance.PlaceComponent(reciprocatingPlateComponent, num, out CriteriaFailureData failureData, false);
					//		else
					//			BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.reciprocating_plate);
					//	}
					//}

					if (!isSetPlate && isNotReset)
						ClearAllAnteriorToothComponents(false, false);

					//check minor connector
					SetMinorConnectors(false, num, data);
				}

				else if (data.isMesh)
				{

				}
			}


		}

		//start index comes 2nd because it's on the "right" side of the template
		// Lower_Start = LastKnownSet;

		if (isStartFound == false)
		{
			// nth to set, no such case, reset
			Debug.LogError("No Such Connector Case");

			if (Error != null)
				Error.Invoke();

			ClearAllBtm();
			return;
		}

		BtmMajor.gameObject.SetActive(true);
		BtmMinor.gameObject.SetActive(true);
	}
	#endregion


	#region Upper Jaw Connector
	public void ClearAllTop(bool invokeEvent = true)
	{
		print("CLEARING UPPER MajConnector");
		//ResetMajorConnectorBools();

		if (TopMajor != null)
			foreach (Transform obj in TopMajor.transform)
			{
				obj.gameObject.SetActive(false);
			}

		if (TopMinor != null)
			foreach (Transform obj in TopMinor.transform)
			{
				obj.gameObject.SetActive(false);
			}

		foreach (GameObject go in PlateGOList)
		{
			go.SetActive(false);
		}

		PalatalBarGO.SetActive(false);

		Hole18.SetActive(false);
		Hole17.SetActive(false);
		Hole16.SetActive(false);
		Hole28.SetActive(false);
		Hole27.SetActive(false);
		Hole26.SetActive(false);

		PalatalStrapGO.SetActive(false);
		AnteriorStrapGO.SetActive(false);

		UIPolyStrap.enabled = false;
		UIPolyStrap.Points.Clear();
		StrapInt.Clear();
		StrapleftInt.Clear();
		StraprightInt.Clear();

		upperMajorConnectorType = RPD_2DComponent.componentType.no_mc_upper_jaw;
		upperMinorConnectorActive = new bool[17];

		if (invokeEvent)
			OnMajorConnectorRemoved?.Invoke(Jaw_Type.upper_jaw);
	}

	public void ClearMajorConnectorByTooth(GenericTooth tooth)
	{
		if (tooth.ToothIndex < 30) // Upper jaw tooth
		{
			// Get the array index for this tooth in the upper major sprite changers
			int toothArrayIndex = GetToothArrayIndex(tooth.ToothIndex, true);

			if (toothArrayIndex >= 0 && toothArrayIndex < upperMajorSpriteChangers.Length)
			{
				print($"Clearing major connector for upper tooth {tooth.ToothIndex} at index {toothArrayIndex}");

				// Deactivate the major connector sprite for this specific tooth
				upperMajorSpriteChangers[toothArrayIndex].gameObject.SetActive(false);

				// Set the minor connector for this tooth to inactive
				if (toothArrayIndex < upperMinorConnectorActive.Length)
				{
					upperMinorConnectorActive[toothArrayIndex] = false;
				}

				// Re-round the connectors to update the visual connections
				RoundUpperJawConnectors();
			}
		}
		else // Lower jaw tooth
		{
			// Get the array index for this tooth in the lower major sprite changers
			int toothArrayIndex = GetToothArrayIndex(tooth.ToothIndex, false);

			if (toothArrayIndex >= 0 && toothArrayIndex < lowerMajorSpriteChangers.Length)
			{
				print($"Clearing major connector for lower tooth {tooth.ToothIndex} at index {toothArrayIndex}");

				// Deactivate the major connector sprite for this specific tooth
				lowerMajorSpriteChangers[toothArrayIndex].gameObject.SetActive(false);

				// Set the minor connector for this tooth to inactive
				if (toothArrayIndex < lowerMinorConnectorActive.Length)
				{
					lowerMinorConnectorActive[toothArrayIndex] = false;
				}

				// Re-round the connectors to update the visual connections
				RoundLowerJawConnectors();
			}
		}
	}

	/// <summary>
	/// Helper method to get the array index for a tooth in the connector arrays
	/// </summary>
	/// <param name="toothIndex">FDI tooth number</param>
	/// <param name="isUpper">True for upper jaw, false for lower jaw</param>
	/// <returns>Array index or -1 if not found</returns>
	private int GetToothArrayIndex(int toothIndex, bool isUpper)
	{
		if (isUpper)
		{
			// Upper jaw: find the index in BarLogic.instance.UpperList
			for (int i = 0; i < BarLogic.instance.UpperList.Count; i++)
			{
				if (BarLogic.instance.UpperList[i] == toothIndex)
					return i;
			}
		}
		else
		{
			// Lower jaw: find the index in BarLogic.instance.LowerList
			for (int i = 0; i < BarLogic.instance.LowerList.Count; i++)
			{
				if (BarLogic.instance.LowerList[i] == toothIndex)
					return i;
			}
		}
		return -1;
	}

	/// <summary>
	/// Helper method to check if a tooth should be excluded from major connectors
	/// </summary>
	/// <param name="toothIndex">FDI tooth number</param>
	/// <returns>True if the tooth should be excluded from major connectors</returns>
	private bool IsToothExcludedFromMajorConnector(int toothIndex)
	{
		// Get reference to the Solo2D_Set2DJaw script
		Solo2D_Set2DJaw setJaw = FindObjectOfType<Solo2D_Set2DJaw>();
		if (setJaw == null) return false;

		// Check if tooth is in the upper jaw excluded list
		if (toothIndex < 30 && setJaw.UpperIndexOutsideOfArch.Contains(toothIndex))
		{
			return true;
		}

		// Check if tooth is in the lower jaw excluded list
		if (toothIndex >= 30 && setJaw.LowerIndexOutsideOfArch.Contains(toothIndex))
		{
			return true;
		}

		return false;
	}

	public void ClearUpperBallRet()
	{
		if (UpperBallRet != null)
			foreach (GameObject go in UpperBallRet)
			{
				go.SetActive(false);
			}
	}

	public bool isPalatalBar = false;

	public void PalatalBar(bool isOn)
	{
		ResetMajorConnectorBools(true);

		if (isOn)
		{
			ClearAllTop();
			CheckAndSetTop(true);
			isPalatalBar = true;

			upperMajorConnectorType = RPD_2DComponent.componentType.mc_palatal_bar;
			RoundUpperJawConnectors();

			OnMajorConnectorPlaced?.Invoke(Jaw_Type.upper_jaw);
		}
		else
		{
			ClearAllTop();
			isPalatalBar = false;
		}
	}

	public void PalBarNoPlates()
	{
		ResetMajorConnectorBools(true);

		ClearAllTop();
		CheckAndSetTop(true, false, false, false, false);
		isPalatalBar = true;

		upperMajorConnectorType = RPD_2DComponent.componentType.mc_palatal_bar;
		RoundUpperJawConnectors();

		OnMajorConnectorPlaced?.Invoke(Jaw_Type.upper_jaw);
	}

	public bool isHorseShoe = false;
	public void HorseShoe(bool isOn)
	{
		ResetMajorConnectorBools(true);

		if (isOn)
		{
			isHorseShoe = true;
			print("setting MJ to horseshoe");
			ClearAllTop();

			CheckAndSetTop(false);

			upperMajorConnectorType = RPD_2DComponent.componentType.mc_horseshoe;
			RoundUpperJawConnectors();

			OnMajorConnectorPlaced?.Invoke(Jaw_Type.upper_jaw);
		}
		else
		{
			isHorseShoe = false;
			print("cancelling MJ from horseshoe");

			ClearAllTop();
		}
	}

	public void HorseshoeNoPlates()
	{
		ResetMajorConnectorBools(true);

		isHorseShoe = true;
		ClearAllTop();

		CheckAndSetTop(false, false, false, false, false);

		upperMajorConnectorType = RPD_2DComponent.componentType.mc_horseshoe;
		RoundUpperJawConnectors();

		OnMajorConnectorPlaced?.Invoke(Jaw_Type.upper_jaw);
	}

	public bool isHole = false;
	public void Hole(bool isOn)
	{
		ResetMajorConnectorBools(true);

		if (isOn)
		{
			isHole = true;
			ClearAllTop();
			CheckAndSetTop(false, true);


			upperMajorConnectorType = RPD_2DComponent.componentType.mc_hole;
			RoundUpperJawConnectors();

			OnMajorConnectorPlaced?.Invoke(Jaw_Type.upper_jaw);
		}
		else
		{
			isHole = false;
			ClearAllTop();
		}
	}

	public void HoleNoPlates()
	{
		ResetMajorConnectorBools(true);

		isHole = true;
		ClearAllTop();
		CheckAndSetTop(false, true, false, false, false);


		upperMajorConnectorType = RPD_2DComponent.componentType.mc_hole;
		RoundUpperJawConnectors();

		OnMajorConnectorPlaced?.Invoke(Jaw_Type.upper_jaw);
	}

	public bool isPalatalStrap = false;
	public void PalatalStrap(bool isOn)
	{
		UIPolyStrap.enabled = false;
		UIPolyStrap.Points.Clear();
		ResetMajorConnectorBools(true);

		if (isOn)
		{
			isPalatalStrap = true;
			ClearAllTop();
			CheckAndSetTop(false, false, true);


			upperMajorConnectorType = RPD_2DComponent.componentType.mc_palatal_strap;
			RoundUpperJawConnectors();

			OnMajorConnectorPlaced?.Invoke(Jaw_Type.upper_jaw);
		}
		else
		{
			isPalatalStrap = false;
			ClearAllTop();
		}
	}

	public void PalStrapNoPlates()
	{
		ResetMajorConnectorBools(true);

		UIPolyStrap.enabled = false;
		UIPolyStrap.Points.Clear();

		isPalatalStrap = true;
		ClearAllTop();
		CheckAndSetTop(false, false, true, false, false);


		upperMajorConnectorType = RPD_2DComponent.componentType.mc_palatal_strap;
		RoundUpperJawConnectors();

		OnMajorConnectorPlaced?.Invoke(Jaw_Type.upper_jaw);
	}

	public bool isPalatalPlate = false;
	public void PalatalPlate(bool isOn)
	{
		print("Placing Palatal Plate MJ WITH force placement of Recip.Plates");

		ResetMajorConnectorBools(true);

		if (isOn)
		{
			isPalatalPlate = true;

			ClearAllTop(true);
			CheckAndSetTop(false, false, false, true);

			upperMajorConnectorType = RPD_2DComponent.componentType.mc_palatal_full_plate;
			RoundUpperJawConnectors();

			OnMajorConnectorPlaced?.Invoke(Jaw_Type.upper_jaw);
		}
		else
		{
			isPalatalPlate = false;
			ClearAllTop();
		}
	}

	public void PalPlatesNoPlates()
	{
		print("Placing Palatal Plate MJ without force placement of Recip.Plates");

		ResetMajorConnectorBools(true);

		isPalatalPlate = true;

		ClearAllTop();
		CheckAndSetTop(false, false, false, true, false);

		upperMajorConnectorType = RPD_2DComponent.componentType.mc_palatal_full_plate;
		RoundUpperJawConnectors();

		OnMajorConnectorPlaced?.Invoke(Jaw_Type.upper_jaw);
	}

	List<int> StrapInt = new List<int>();
	List<int> PlateInt = new List<int>();

	Transform FindChildOfName(Transform parent, string childName)
	{
		for (int i = 0; i < parent.childCount; i++)
		{
			if (parent.GetChild(i).name == childName)
				return parent.GetChild(i);
		}

		return null;
	}

	public void CheckAndSetTop(bool isPalatalBar = false, bool isHole = false, bool isPalatalStrap = false, bool isPalatalPlate = false, bool ForcePlaceRecipPlates = true)
	{
		print("is forcing recip plates: " + ForcePlaceRecipPlates);

		GameObject TopJaw = BarLogic.instance.UpJaw;

		bool isStartFound = false;

		int LastKnownSet = 0;

		int EndCheck = 8;

		if (isPalatalBar || isPalatalStrap)
			EndCheck = 5;

		StrapInt.Clear();
		StrapleftInt.Clear();
		StraprightInt.Clear();

		PlateInt.Clear();

		//check left
		for (int i = 0; i < EndCheck; i++)
		{
			int num = BarLogic.instance.UpperList[i];
			ConnectorData data = TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().GetConnectorData();

			CheckToothComponentDirection(data);

			if ((isHole || isPalatalBar || isPalatalStrap) && i == 4 && isStartFound == false)
			{
				// nth to set, no such case, reset
				Debug.LogError("No Such Connector Case");

				if (Error != null)
					Error.Invoke();

				ClearAllTop();
				return;
			}

			if (!isStartFound && data.presence) // tooth presence
			{
				if (data.isComponentPresent)
				{
					//if the major connector selected is horseshoe type and tooth is not a Mesh
					if (isHorseShoe && !data.isMesh && !isPalatalPlate && !isHole && ForcePlaceRecipPlates)
					{
						print("Major connector logic : Tooth" + num + " || has plate: " + TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.reciprocating_plate));
						//checks that there is no exisitng recipClasp and recipPlates

						GenericTooth tooth = TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>();
						bool hasReciprocatingClasp = tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_clasp)
													|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distobuccal)
													|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distolingual)
													|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiobuccal)
													|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiolingual);

						if (!hasReciprocatingClasp && tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_plate))
						{
							print("Set horseshoe plate on tooth ID " + num);

							if (RPDManager.instance.useNew2DSystem)
								RPDManager.instance.PlaceComponent(reciprocatingPlateComponent, num, out CriteriaFailureData failureData, false);
							else
								TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.reciprocating_plate);

							data = TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().GetConnectorData();
							//check minor connector
							SetMinorConnectors(true, num, data);
						}

						//checks if tooth is anterior
						if (num == 11 || num == 21 || num == 12 || num == 22 || num == 13 || num == 23)
						{
							//checks to make sure there isn't an existing ac_full component
							if (!TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.ac_full))
							{
								//NOW REQUESTED TO DISABLE IT
								/*if (RPDManager.instance.useNew2DSystem)
									RPDManager.instance.PlaceComponent(anteriorCingulumFullRestComponent, num, out CriteriaFailureData failureData, false);
								else
									TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.ac_full);*/
							}
						}
					}

					else if (!data.isMesh)
					{
						if (num == 11 || num == 21 || num == 12 || num == 22 || num == 13 || num == 23)
						{

						}
					}

					/*if ((isPalatalBar || isPalatalStrap) && ForcePlaceRecipPlates)
						ClearAllAnteriorToothComponents(true, true);
					if ((isHole || isPalatalPlate) && ForcePlaceRecipPlates)
						ClearAllAnteriorToothComponents(false, true);*/

					// Check if tooth should be excluded from major connectors
					bool toothIncluded = !IsToothExcludedFromMajorConnector(num);
					if (toothIncluded)
					{
						//Checks if the Connector needs to end one tooth earlier as there's only Mesial Component
						if (EndConnectorAtMesial)
							TopMajor.transform.Find((num - 1).ToString()).gameObject.SetActive(true);
						else
							TopMajor.transform.Find(num.ToString()).gameObject.SetActive(true);
					}

					//check minor connector
					SetMinorConnectors(true, num, data);

					// Only set LastKnownSet if the tooth is actually included in major connector
					if (toothIncluded && LastKnownSet == 0)
						LastKnownSet = num;

					isStartFound = true;

					if (EndConnectorAtMesial)
					{
						continue;
					}
					else
					{
						StrapInt.Add(i);
						PlateInt.Add(i);
						StrapleftInt.Add(i);
					}
				}

				else
				{
					//new added, do not add recip.plate if posterior teeth is present without components, but only add them for anterior teeth
					if (isHorseShoe && !data.isMesh && !isPalatalPlate && !isHole)
					{
						if (num == 11 || num == 21 || num == 12 || num == 22 || num == 13 || num == 23)
						{
							GenericTooth tooth = TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>();
							bool hasReciprocatingClasp = tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_clasp)
														|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distobuccal)
														|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distolingual)
														|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiobuccal)
														|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiolingual);

							//print("Major connector logic : Tooth" + num + " || has plate: " + TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.reciprocating_plate));
							if (!hasReciprocatingClasp && !tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_plate))
							{
								//print("Set horseshoe plate on tooth ID " + num);

								if (RPDManager.instance.useNew2DSystem)
									RPDManager.instance.PlaceComponent(reciprocatingPlateComponent, num, out CriteriaFailureData failureData, false);
								else
									TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.reciprocating_plate);

								data = TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().GetConnectorData();
								//check minor connector
								SetMinorConnectors(true, num, data);
							}

							if (!TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.ac_full))
							{
								//NOW REQUESTED TO DISABLE IT
								/*if (RPDManager.instance.useNew2DSystem)
									RPDManager.instance.PlaceComponent(anteriorCingulumFullRestComponent, num, out CriteriaFailureData failureData, false);
								else
									TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.ac_full);*/
							}
						}
					}
				}
			}

			else if (!isStartFound && !data.presence)
			{
				if (data.isMesh)
				{
					if (TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.tori_mesh))
						continue;
					else if (!IsToothExcludedFromMajorConnector(num))
						TopMajor.transform.Find(num.ToString()).gameObject.SetActive(true);

					//find minor connector from mesh data

					if (LastKnownSet == 0)
						LastKnownSet = num;

					isStartFound = true;

					if (TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.tori_mesh))
						continue;
					else
					{
						StrapInt.Add(i);
						PlateInt.Add(i);
						StrapleftInt.Add(i);
					}
				}
			}
			else if (isStartFound)
			{
				print("is forcing recip plates - isStartFound: " + ForcePlaceRecipPlates);

				if (data.isMesh && TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.tori_mesh))
				{
					continue;
				}
				else if (!IsToothExcludedFromMajorConnector(num))
				{
					TopMajor.transform.Find(num.ToString()).gameObject.SetActive(true);

					// Only set LastKnownSet if the tooth is actually included in major connector
					if (LastKnownSet == 0)
						LastKnownSet = num;
				}

				if (data.isMesh && TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.tori_mesh))
				{
					continue;
				}
				else
				{
					PlateInt.Add(i);
					StrapInt.Add(i);
					StrapleftInt.Add(i);
				}

				//if it's horseshoe, add plates
				if (isHorseShoe && !data.isMesh && data.presence && !isPalatalPlate && !isHole && ForcePlaceRecipPlates)
				{
					//print("Major connector logic : Tooth" + num + " || has plate: " + TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.reciprocating_plate));

					GenericTooth tooth = TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>();
					bool hasReciprocatingClasp = tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_clasp)
												|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distobuccal)
												|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distolingual)
												|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiobuccal)
												|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiolingual);

					if (!hasReciprocatingClasp && !tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_plate))
					{
						//print("Set horseshoe plate on tooth ID " + num);

						if (RPDManager.instance.useNew2DSystem)
							RPDManager.instance.PlaceComponent(reciprocatingPlateComponent, num, out CriteriaFailureData failureData, false);
						else
							TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.reciprocating_plate);

						data = TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().GetConnectorData();
						//check minor connector
						SetMinorConnectors(true, num, data);
					}

					if (num == 11 || num == 21 || num == 12 || num == 22 || num == 13 || num == 23)
					{
						if (!TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.ac_full))
						{
							//NOW REQUESTED TO DISABLE IT
							/*if (RPDManager.instance.useNew2DSystem)
								RPDManager.instance.PlaceComponent(anteriorCingulumFullRestComponent, num, out CriteriaFailureData failureData, false);
							else
								TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.ac_full);*/
						}
					}
				}

				if (data.isComponentPresent)
				{
					//if it's horseshoe, add plates
					if (isHorseShoe && !data.isMesh && !isPalatalPlate && !isHole && ForcePlaceRecipPlates)
					{
						//print("Major connector logic : Tooth" + num + " || has plate: " + TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.reciprocating_plate));

						GenericTooth tooth = TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>();
						bool hasReciprocatingClasp = tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_clasp)
													|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distobuccal)
													|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distolingual)
													|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiobuccal)
													|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiolingual);

						if (!hasReciprocatingClasp && !tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_plate))
						{
							//print("Set horseshoe plate on tooth ID " + num);

							if (RPDManager.instance.useNew2DSystem)
								RPDManager.instance.PlaceComponent(reciprocatingPlateComponent, num, out CriteriaFailureData failureData, false);
							else
								TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.reciprocating_plate);

							data = TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().GetConnectorData();
							//check minor connector
							SetMinorConnectors(true, num, data);
						}

						if (num == 11 || num == 21 || num == 12 || num == 22 || num == 13 || num == 23)
						{
							if (!TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.ac_full))
							{
								//NOW REQUESTED TO DISABLE IT
								/*if (RPDManager.instance.useNew2DSystem)
									RPDManager.instance.PlaceComponent(anteriorCingulumFullRestComponent, num, out CriteriaFailureData failureData, false);
								else
									TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.ac_full);*/
							}
						}
					}

					/*if ((isPalatalBar || isPalatalStrap) && ForcePlaceRecipPlates)
						ClearAllAnteriorToothComponents(true, true);
					if ((isHole || isPalatalPlate) && ForcePlaceRecipPlates)
						ClearAllAnteriorToothComponents(false, true);*/

					//check minor connector
					SetMinorConnectors(true, num, data);
				}
				else if (data.isMesh)
				{

				}
			}
		}

		if (isStartFound == false)
		{
			// nth to set, no such case, reset
			Debug.LogError("No Such Connector Case");

			if (Error != null)
				Error.Invoke();

			ClearAllTop();
			return;
		}

		//set hole left
		if (isHole)
			SetHole(LastKnownSet);

		// Upper_Start = LastKnownSet;
		print("Upper Start index:" + Upper_Start);

		LastKnownSet = 0;
		EndCheck = 7;

		if (isPalatalBar || isPalatalStrap)
			EndCheck = 10;

		isStartFound = false; // recheck start

		List<int> StrapRightTemp = new List<int>();
		List<int> PlateRightTemp = new List<int>();

		//check right
		for (int i = 15; i > EndCheck; i--)
		{
			int num = BarLogic.instance.UpperList[i];
			ConnectorData data = TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().GetConnectorData();

			CheckToothComponentDirection(data);

			if ((isHole || isPalatalBar || isPalatalStrap) && i == 12 && isStartFound == false)
			{
				// nth to set, no such case, reset
				Debug.LogError("No Such Connector Case");

				if (Error != null)
					Error.Invoke();

				ClearAllTop();
				return;
			}

			if (!isStartFound && data.presence) // tooth presence
			{
				if (data.isComponentPresent)
				{
					//added if horseshoe, add plates
					if (isHorseShoe && !data.isMesh && !isPalatalPlate && !isHole && ForcePlaceRecipPlates)
					{
						GenericTooth tooth = TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>();
						bool hasReciprocatingClasp = tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_clasp)
													|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distobuccal)
													|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distolingual)
													|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiobuccal)
													|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiolingual);

						print("Tooth" + num + " || has plate: " + tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_plate));
						if (!hasReciprocatingClasp && !tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_plate))
						{
							print("Set horseshoe plate on tooth ID " + num);

							if (RPDManager.instance.useNew2DSystem)
								RPDManager.instance.PlaceComponent(reciprocatingPlateComponent, num, out CriteriaFailureData failureData, false);
							else
								TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.reciprocating_plate);

							data = TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().GetConnectorData();
							//check minor connector
							SetMinorConnectors(true, num, data);
						}

						if (num == 11 || num == 21 || num == 12 || num == 22 || num == 13 || num == 23)
						{
							//NOW REQUESTED TO DISABLE IT
							/*if (!TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.ac_full))
							{
								if (RPDManager.instance.useNew2DSystem)
									RPDManager.instance.PlaceComponent(anteriorCingulumFullRestComponent, num, out CriteriaFailureData failureData, false);
								else
									TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.ac_full);
							}*/
						}
					}

					/*if ((isPalatalBar || isPalatalStrap) && ForcePlaceRecipPlates)
						ClearAllAnteriorToothComponents(true, true);
					if ((isHole || isPalatalPlate) && ForcePlaceRecipPlates)
						ClearAllAnteriorToothComponents(false, true);*/

					// Check if tooth should be excluded from major connectors
					bool toothIncluded = !IsToothExcludedFromMajorConnector(num);
					if (toothIncluded)
					{
						//Checks if the Connector needs to end one tooth earlier as there's only Mesial Component
						if (EndConnectorAtMesial)
							TopMajor.transform.Find((num - 1).ToString()).gameObject.SetActive(true);
						else
							TopMajor.transform.Find(num.ToString()).gameObject.SetActive(true);
					}

					//check minor connector
					SetMinorConnectors(true, num, data);

					isStartFound = true;

					// Only set LastKnownSet if the tooth is actually included in major connector
					if (toothIncluded && LastKnownSet == 0)
						LastKnownSet = num;

					if (EndConnectorAtMesial)
					{
						continue;
					}
					else
					{
						StrapRightTemp.Add(i);
						PlateRightTemp.Add(i);
						StraprightInt.Add(i);
					}
				}

				else
				{
					//added if horseshoe, do not add recip.plate if posterior teeth is present without components, but only add them for anterior teeth
					if (isHorseShoe && !data.isMesh && !isPalatalPlate && !isHole && ForcePlaceRecipPlates)
					{
						if (num == 11 || num == 21 || num == 12 || num == 22 || num == 13 || num == 23)
						{
							print("Tooth" + num + " || has plate: " + TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.reciprocating_plate));

							GenericTooth tooth = TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>();
							bool hasReciprocatingClasp = tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_clasp)
														|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distobuccal)
														|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distolingual)
														|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiobuccal)
														|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiolingual);

							if (!hasReciprocatingClasp && !tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_plate))
							{
								print("Set horseshoe plate on tooth ID " + num + " right side check");
								if (RPDManager.instance.useNew2DSystem)
									RPDManager.instance.PlaceComponent(reciprocatingPlateComponent, num, out CriteriaFailureData failureData, false);
								else
									TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.reciprocating_plate);

								data = TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().GetConnectorData();
								//check minor connector
								SetMinorConnectors(true, num, data);
							}

							if (!TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.ac_full))
							{
								//NOW REQUESTED TO DISABLE IT
								/*if (RPDManager.instance.useNew2DSystem)
									RPDManager.instance.PlaceComponent(anteriorCingulumFullRestComponent, num, out CriteriaFailureData failureData, false);
								else
									TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.ac_full);*/
							}
						}
					}
				}
			}

			else if (!isStartFound && !data.presence)
			{
				if (data.isMesh)
				{
					if (TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.tori_mesh))
					{ continue; }
					else if (!IsToothExcludedFromMajorConnector(num))
						TopMajor.transform.Find(num.ToString()).gameObject.SetActive(true);

					//find minor connector from mesh data

					isStartFound = true;

					if (LastKnownSet == 0)
						LastKnownSet = num;

					if (TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.tori_mesh))
						continue;
					else
					{
						StrapRightTemp.Add(i);
						PlateRightTemp.Add(i);
						StraprightInt.Add(i);
					}
				}
			}
			else if (isStartFound)
			{
				if (data.isMesh && TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.tori_mesh))
				{
					continue;
				}
				else if (!IsToothExcludedFromMajorConnector(num))
				{
					TopMajor.transform.Find(num.ToString()).gameObject.SetActive(true);

					// Only set LastKnownSet if the tooth is actually included in major connector
					if (LastKnownSet == 0)
						LastKnownSet = num;
				}

				if (TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.tori_mesh))
					continue;
				else
				{
					PlateRightTemp.Add(i);
					StrapRightTemp.Add(i);
					StraprightInt.Add(i);
				}

				//added if it's horseshoe, add plates
				if (isHorseShoe && !data.isMesh && data.presence && !isPalatalPlate && !isHole && ForcePlaceRecipPlates)
				{
					GenericTooth tooth = TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>();
					bool hasReciprocatingClasp = tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_clasp)
												|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distobuccal)
												|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_distolingual)
												|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiobuccal)
												|| tooth.HasComponent(RPD_2DComponent.componentType.recip_clasp_mesiolingual);

					//print("Tooth" + num + " || has plate: " + TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.reciprocating_plate));
					if (!hasReciprocatingClasp && !tooth.HasComponent(RPD_2DComponent.componentType.reciprocating_plate))
					{
						//print("Set horseshoe plate on tooth ID " + num + " right side check");

						if (RPDManager.instance.useNew2DSystem)
							RPDManager.instance.PlaceComponent(reciprocatingPlateComponent, num, out CriteriaFailureData failureData, false);
						else
							TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.reciprocating_plate);


						data = TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().GetConnectorData();
						//check minor connector
						SetMinorConnectors(true, num, data);
					}

					if (num == 11 || num == 21 || num == 12 || num == 22 || num == 13 || num == 23)
					{
						if (!TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.ac_full))
						{
							//NOW REQUESTED TO DISABLE IT
							/*if (RPDManager.instance.useNew2DSystem)
								RPDManager.instance.PlaceComponent(anteriorCingulumFullRestComponent, num, out CriteriaFailureData failureData, false);
							else
								TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.ac_full);*/
						}
					}
				}

				if (data.isComponentPresent)
				{
					//if (!TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.reciprocating_clasp))
					//	TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.reciprocating_plate);

					//	if (num == 11 || num == 21 || num == 12 || num == 22 || num == 13 || num == 23)
					//	{
					//		TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.ac_full);
					//	}
					//}

					/*if ((isPalatalBar || isPalatalStrap) && ForcePlaceRecipPlates)
						ClearAllAnteriorToothComponents(true,true);
					if ((isHole || isPalatalPlate) && ForcePlaceRecipPlates)
						ClearAllAnteriorToothComponents(false, true);*/

					//check minor connector
					SetMinorConnectors(true, num, data);
				}
				else if (data.isMesh)
				{

				}
			}
		}

		StrapRightTemp.Reverse();
		PlateRightTemp.Reverse();

		foreach (var right in StrapRightTemp)
		{
			StrapInt.Add(right);
		}

		foreach (var right2 in PlateRightTemp)
			PlateInt.Add(right2);

		if (isStartFound == false)
		{
			// nth to set, no such case, reset
			Debug.LogError("No Such Connector Case");

			if (Error != null)
				Error.Invoke();

			ClearAllTop();
			return;
		}

		//set hole left
		if (isHole)
			SetHole(LastKnownSet);

		// Upper_End = LastKnownSet;
		print("Upper End index:" + Upper_End);

		if (isPalatalBar)
			PalatalBarGO.SetActive(true);
		else
			PalatalBarGO.SetActive(false);

		if (isPalatalStrap)
			SetStrap();// LastKnownSet);

		if (isPalatalPlate)
			SetPlate();

		/*if ((isPalatalBar || isPalatalStrap) && ForcePlaceRecipPlates)
			ClearAllAnteriorToothComponents(true, true);
		if ((isHole || isPalatalPlate) && ForcePlaceRecipPlates)
			ClearAllAnteriorToothComponents(false, true);*/

		TopMajor.gameObject.SetActive(true);
		TopMinor.gameObject.SetActive(true);
	}


	bool EndConnectorAtMesial = false;
	/// <summary>
	/// Checks if the inputted ConnectorData returns with any Distal Components on the teeth and changes the bool EndConnectorAtMesial
	/// to false if there's Distal components
	/// </summary>
	/// <param name="data">Input of ConnectorData to check</param>
	void CheckToothComponentDirection(ConnectorData data)
	{
		if (data.isDistoComp)
			EndConnectorAtMesial = false;
		else
			EndConnectorAtMesial = true;
	}

	[SerializeField]
	GameObject Hole18, Hole17, Hole16, Hole28, Hole27, Hole26;

	void SetHole(int number)
	{
		//Aka Anterior-Posterior Strap

		//Add in the additional Anterior Connector part
		AnteriorStrapGO.SetActive(true);

		//Posterior Strap
		if (number == 18)
			Hole18.SetActive(true);
		else if (number == 17)
			Hole17.SetActive(true);
		else if (number == 16)
			Hole16.SetActive(true);
		else if (number == 28)
			Hole28.SetActive(true);
		else if (number == 27)
			Hole27.SetActive(true);
		else if (number == 26)
			Hole26.SetActive(true);
	}

	[SerializeField] List<GameObject> DynamicShape = new List<GameObject>();
	//[SerializeField] List<GameObject> DynaShpOuter = new List<GameObject>();
	[SerializeField] List<GameObject> DynamicMidBounds = new List<GameObject>();

	List<int> StrapleftInt = new List<int>();
	List<int> StraprightInt = new List<int>();

	public UnityEngine.UI.Extensions.UIPolygonCustom UIPolyStrap;
	/// <summary>
	/// Handles the logic of drawing the dynamic shape polygon for Palatal Strap MJ type
	/// </summary>
	public void SetStrap()//int number)
	{
		//PalatalStrapGO.SetActive(true);

		UIPolyStrap.enabled = false;
		UIPolyStrap.Points.Clear();

		//print("Top line Left " + StrapleftInt[StrapleftInt.Count - 1]);
		//print("Top line Right " + StraprightInt[StraprightInt.Count - 1]);
		//print("Btm line Right " + StraprightInt[0]);
		//print("Btm line Left " + StrapleftInt[0]);

		CheckLoop(StrapleftInt[0], true); //Adding left connetors from mid line

		//Adding left hand connectors against plates
		foreach (var i in StrapleftInt)
		{
			//print("leftpoint: " + i.ToString());
			UIPolyStrap.Points.Add(DynamicShape[i]);//DynaShpOuter[i]);
		}

		CheckLoop(StrapleftInt[StrapleftInt.Count - 1], false); //Adding left connetors going to mid line
		CheckLoop(StraprightInt[StraprightInt.Count - 1], true); //Adding right connetors from mid line

		List<int> rightstrapTemp = StraprightInt;
		rightstrapTemp.Reverse();
		//Adding right hand connectors against plates
		foreach (var k in rightstrapTemp)
		{
			//print("rightpoint: " + k.ToString());
			UIPolyStrap.Points.Add(DynamicShape[k + 1]);//DynaShpOuter[k]); 
		}

		CheckLoop(StraprightInt[StraprightInt.Count - 1], false); //Adding right connetors going to mid line


		UIPolyStrap.Points.Add(UIPolyStrap.Points[0]);  //Close the loop
		UIPolyStrap.enabled = true; //enable component

		void CheckLoop(int number, bool reverse)
		{
			foreach (GameObject j in DynamicMidBounds)
				if (j.name == number.ToString())
				{
					if (reverse)
					{
						for (int i = j.transform.childCount; i > 0; i--)
							//foreach (Transform go in j.transform)
							UIPolyStrap.Points.Add(j.transform.GetChild(i - 1).gameObject);
					}

					else
					{
						for (int i = 0; i < j.transform.childCount; i++)
							UIPolyStrap.Points.Add(j.transform.GetChild(i).gameObject);

						//foreach (Transform go in j.transform)
						//    UIPolyStrap.Points.Add(go.gameObject);
					}
				}
		}

		#region Dynamic Shape - old code
		//UnityEngine.UI.Extensions.UIPolygonCustom UiPolygon = PalatalStrapGO.GetComponent<UnityEngine.UI.Extensions.UIPolygonCustom>();

		//UiPolygon.enabled = false;
		//UiPolygon.Points.Clear();


		//foreach (var i in StrapInt)
		//{
		//	if (!UiPolygon.Points.Contains(DynamicShape[i]))
		//		UiPolygon.Points.Add(DynamicShape[i]);
		//	if (!UiPolygon.Points.Contains(DynamicShape[i + 1]))
		//		UiPolygon.Points.Add(DynamicShape[i + 1]);
		//}
		//UiPolygon.Points.Add(DynamicShape[StrapInt[0]]); //close the loop
		//UiPolygon.enabled = true;

		//New Code but keeping for now
		//foreach (GameObject j in DynamicMidBounds)
		//    if (j.name == StrapleftInt[StrapleftInt.Count - 1].ToString())  //Adding left connetors going to mid line
		//    {
		//        foreach (Transform go in j.transform)
		//            UIPolyStrap.Points.Add(go.gameObject);
		//    }
		//foreach (GameObject j2 in DynamicMidBounds)
		//    if (j2.name == StraprightInt[StraprightInt.Count - 1].ToString())//0].ToString()) //Adding right connetors going to mid line
		//    {
		//        foreach (Transform go in j2.transform)
		//            UIPolyStrap.Points.Add(go.gameObject);
		//    }

		//foreach (GameObject l in DynamicMidBounds)
		//    if (l.name == StraprightInt[0].ToString()) //StraprightInt.Count-1].ToString())	//Adding final right connector back
		//    {
		//        foreach (Transform go in l.transform)
		//            UIPolyStrap.Points.Add(go.gameObject);
		//    }

		//foreach (GameObject l2 in DynamicMidBounds)
		//    if (l2.name == StrapleftInt[0].ToString())	//Adding final left connector back
		//    {
		//        foreach (Transform go in l2.transform)
		//            UIPolyStrap.Points.Add(go.gameObject);
		//    }
		#endregion
	}

	public void SetPlate()
	{
		PlateGOList[0].transform.parent.gameObject.SetActive(true);

		PlateGOList[PlateInt[0]].SetActive(true);
	}
	#endregion

	public Color Metal;
	public Color Acrylic;
	public Color FullAcrylic;

	void ResetMajorConnectorBools(bool isUpper)
	{
		if (isUpper)
		{
			isHorseShoe = false;
			isPalatalBar = false;
			isPalatalPlate = false;
			isPalatalStrap = false;
			isHole = false;
		}
		else
		{
			isLingualBar = false;
			isLingualPlate = false;
		}
	}

	/// <summary>
	/// Handles the clearing of specific/all anterior tooth components
	/// </summary>
	/// <param name="ClearAll">Bool to determine if the tooth should clear ALL of its components, or only the Recip.Plate and Cingulum Full Rest</param>
	/// <param name="isUpper">Bool to determine if the Jaw is Upper Jaw</param>
	void ClearAllAnteriorToothComponents(bool ClearAll, bool isUpper)
	{
		print("forcing the clearing of anterior tooth componentsssss " + " clear all? " + ClearAll);

		//clear all reciprocating plates that appear
		GameObject TopJaw = BarLogic.instance.UpJaw;
		//clear all reciprocating plates that appear
		GameObject BtmJaw = BarLogic.instance.BtmJaw;

		if (isUpper)
		{
			foreach (int num in BarLogic.instance.UpperList)
			{
				//if tooth is anterior tooth
				if (num == 11 || num == 21 || num == 12 || num == 22 || num == 13 || num == 23)
				{
					if (ClearAll) //clears all components on the anterior tooth
					{
						TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().Reset();
						VisualsManager.DestroyAllVisuals(num);
					}

					else //clear only the Recip Plates and AC Full rests
					{
						//clears recip.plate
						if (TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.reciprocating_plate))
							RPDManager.instance.RemoveComponent(reciprocatingPlateComponent, num);

						if (TopJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.ac_full))
							RPDManager.instance.RemoveComponent(anteriorCingulumFullRestComponent, num);
					}
				}
			}
		}

		else
		{
			foreach (int num in BarLogic.instance.LowerList)
			{
				//if tooth is anterior tooth
				if (num == 41 || num == 31 || num == 42 || num == 32 || num == 43 || num == 33)
				{
					//clears all Anterior Rests and Plates that appear
					if (BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.reciprocating_plate))
					{
						if (RPDManager.instance.useNew2DSystem)
						{
							RPDManager.instance.RemoveComponent(reciprocatingPlateComponent, num);
						}
						else
							BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().RemoveComponent(RPD_2DComponent.componentType.reciprocating_plate);
					}

					if (BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.ac_full))
					{
						if (RPDManager.instance.useNew2DSystem)
						{
							RPDManager.instance.RemoveComponent(anteriorCingulumFullRestComponent, num);
						}
						else
							BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().RemoveComponent(RPD_2DComponent.componentType.ac_full);
					}
				}
				else //tooth is posterior tooth
				{
					if (BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().HasComponent(RPD_2DComponent.componentType.reciprocating_plate))
					{
						if (RPDManager.instance.useNew2DSystem)
						{
							RPDManager.instance.RemoveComponent(reciprocatingPlateComponent, num);
						}
						else
							BtmJaw.transform.Find(num.ToString()).GetChild(0).GetComponent<GenericTooth>().RemoveComponent(RPD_2DComponent.componentType.reciprocating_plate);
					}
				}
			}
		}
	}

	void SetMinorConnectors(bool isUpper, int num, ConnectorData data)
	{
		if (isUpper)
		{
			if (data.isDistoComp)
			{
				if (num == 11 || num == 21)
				{
					TopMinor.transform.Find("Center").gameObject.SetActive(true);
					upperMinorConnectorActive[Utils.FDINumberingToPatchID(8, out Jaw_Type jawType)] = true; //huh? why 8
				}
				else
				{
					// For distal minor connector, check both current and next major connector (if exists)
					Transform currentMajorConnector = TopMajor.transform.Find(num.ToString());
					bool currentMajorActive = currentMajorConnector != null && currentMajorConnector.gameObject.activeInHierarchy;

					bool nextMajorActive = false;
					// Check next major connector only if num is not 18, 28
					if (num != 18 && num != 28)
					{
						Transform nextMajorConnector = TopMajor.transform.Find((num + 1).ToString());
						nextMajorActive = nextMajorConnector != null && nextMajorConnector.gameObject.activeInHierarchy;
					}

					// Set minor connector if at least one major connector (current or next) is active
					if (currentMajorActive || nextMajorActive)
					{
						Transform minorConnector = TopMinor.transform.Find(num.ToString());
						if (minorConnector != null)
						{
							minorConnector.gameObject.SetActive(true);
							upperMinorConnectorActive[Utils.FDINumberingToPatchID(num, out Jaw_Type jawType)] = true;
						}
					}
				}
			}

			if (data.isMiseolComp)
			{
				if (num == 11 || num == 21)
				{
					TopMinor.transform.Find("Center").gameObject.SetActive(true);
					upperMinorConnectorActive[Utils.FDINumberingToPatchID(7, out Jaw_Type jawType)] = true; //huh? why 7
				}
				else
				{
					Transform currentMajorConnector = TopMajor.transform.Find((num - 1).ToString());
					bool currentMajorActive = currentMajorConnector != null && currentMajorConnector.gameObject.activeInHierarchy;

					bool prevMajorActive = false;

					Transform prevMajorConnector = TopMajor.transform.Find(num.ToString());
					prevMajorActive = prevMajorConnector != null && prevMajorConnector.gameObject.activeInHierarchy;

					// Set minor connector if at least one major connector (current or previous) is active
					if (currentMajorActive || prevMajorActive)
					{
						Transform minorConnector = TopMinor.transform.Find((num - 1).ToString());
						if (minorConnector != null)
						{
							minorConnector.gameObject.SetActive(true);
							upperMinorConnectorActive[Utils.FDINumberingToPatchID((num - 1), out Jaw_Type jawType)] = true;
						}
					}
				}
			}
		}
		else
		{
			if (data.isDistoComp)
			{
				if (num == 41 || num == 31)
				{
					BtmMinor.transform.Find("Center").gameObject.SetActive(true);
					lowerMinorConnectorActive[Utils.FDINumberingToPatchID(8, out Jaw_Type jawType)] = true;
				}
				else
				{
					// For distal minor connector, check both current and next major connector (if exists)
					Transform currentMajorConnector = BtmMajor.transform.Find(num.ToString());
					bool currentMajorActive = currentMajorConnector != null && currentMajorConnector.gameObject.activeInHierarchy;

					bool nextMajorActive = false;
					// Check next major connector only if num is not 38, or 48
					if (num != 38 && num != 48)
					{
						Transform nextMajorConnector = BtmMajor.transform.Find((num + 1).ToString());
						nextMajorActive = nextMajorConnector != null && nextMajorConnector.gameObject.activeInHierarchy;
					}

					// Set minor connector if at least one major connector (current or next) is active
					if (currentMajorActive || nextMajorActive)
					{
						Transform minorConnector = BtmMinor.transform.Find(num.ToString());
						if (minorConnector != null)
						{
							minorConnector.gameObject.SetActive(true);
							lowerMinorConnectorActive[Utils.FDINumberingToPatchID(num, out Jaw_Type jawType)] = true;
						}
					}
				}
			}

			if (data.isMiseolComp)
			{
				if (num == 41 || num == 31)
				{
					BtmMinor.transform.Find("Center").gameObject.SetActive(true);
					lowerMinorConnectorActive[Utils.FDINumberingToPatchID(7, out Jaw_Type jawType)] = true;
				}
				else
				{
					Transform currentMajorConnector = BtmMajor.transform.Find((num - 1).ToString());
					bool currentMajorActive = currentMajorConnector != null && currentMajorConnector.gameObject.activeInHierarchy;

					bool prevMajorActive = false;

					Transform prevMajorConnector = BtmMajor.transform.Find(num.ToString());
					prevMajorActive = prevMajorConnector != null && prevMajorConnector.gameObject.activeInHierarchy;

					// Set minor connector if at least one major connector (current or previous) is active
					if (currentMajorActive || prevMajorActive)
					{
						Transform minorConnector = BtmMinor.transform.Find((num - 1).ToString());
						if (minorConnector != null)
						{
							minorConnector.gameObject.SetActive(true);
							lowerMinorConnectorActive[Utils.FDINumberingToPatchID((num - 1), out Jaw_Type jawType)] = true;
						}
					}
				}
			}
		}
	}

	public void ReSetMajorConnectors(int toothIndex, bool ForcePlaceRecipPlates)
	{
		//print("tooth index: " + toothIndex);
		//print("attempting to re set the major connectors");
		//print("||hole||"+isHole + "||PalatalBar||" + isPalatalBar + "||Palatalplate||" + isPalatalPlate + "||PalatalStrap||" + isPalatalStrap + "||horseshoe||" + isHorseShoe);
		//print("||Lingual Bar||" + isLingualBar + "||Lingual Plate||" + isLingualPlate);

		if (toothIndex < 29) //Is Upper Jaw
		{
			//print("resetting upper jaw MJ");

			if (isHole)
			{
				if (ForcePlaceRecipPlates)
					Hole(true);
				else
					HoleNoPlates();
			}
			else if (isPalatalBar)
			{
				if (ForcePlaceRecipPlates)
					PalatalBar(true);
				else
					PalBarNoPlates();
			}
			else if (isPalatalPlate)
			{
				if (ForcePlaceRecipPlates)
					PalatalPlate(true);
				else
					PalPlatesNoPlates();
			}
			else if (isPalatalStrap)
			{
				if (ForcePlaceRecipPlates)
					PalatalStrap(true);
				else
					PalStrapNoPlates();
			}
			else if (isHorseShoe)
			{
				if (ForcePlaceRecipPlates)
					HorseShoe(true);
				else
					HorseshoeNoPlates();
			}

			if ((isPalatalBar || isPalatalStrap) && ForcePlaceRecipPlates)
				ClearAllAnteriorToothComponents(true, true);
			if ((isHole || isPalatalPlate) && ForcePlaceRecipPlates)
				ClearAllAnteriorToothComponents(false, true);
		}

		else //Is Lower Jaw
		{
			//print("resetting lower jaw MJ");

			if (isLingualBar)
			{
				if (ForcePlaceRecipPlates)
					LingualBar(true);
				else
					LingualBarReset();
			}
			else if (isLingualPlate)
			{
				if (ForcePlaceRecipPlates)
					LingualPlate(true);
				else
					LingualPlateNoPlate();
			}
		}
	}

	[SerializeField] Stage4_PanelControl S4UI;

	public void SetMaterial(int jawMaterial)
	{
		// jaw material enum: 0 = metal, 1 = acrylic, 2 = full_acrylic
		DLLIntegration.instance.jUpper.jaw_material = jawMaterial;
		DLLIntegration.instance.jLower.jaw_material = jawMaterial;

		//if (jawMaterial == 0) // Metal
		//{
		//	//Stage4_PanelControl.instance.MaterialSetting(false);
		//	//S4UI.MaterialSetting(0);

		//	//set colour to grey, all major connectors only
		//	//grey colour
		//	foreach (Transform t in BtmMajor)
		//	{
		//		t.GetComponent<Image>().color = Metal;
		//	}

		//	foreach (Transform t in TopMajor)
		//	{
		//		t.GetComponent<Image>().color = Metal;
		//	}

		//	//palatal bar
		//	PalatalBarGO.GetComponent<Image>().color = Metal;

		//	//palatalstrap
		//	PalatalStrapGO.GetComponent<UnityEngine.UI.Extensions.UIPolygonCustom>().color = Metal;

		//	//hole sprites
		//	Hole16.GetComponent<Image>().color = Metal;
		//	Hole17.GetComponent<Image>().color = Metal;
		//	Hole18.GetComponent<Image>().color = Metal;
		//	Hole26.GetComponent<Image>().color = Metal;
		//	Hole27.GetComponent<Image>().color = Metal;
		//	Hole28.GetComponent<Image>().color = Metal;

		//	//remove all Ball Retainers
		//	foreach (GameObject go in UpperBallRet)
		//	{
		//		go.SetActive(false);
		//	}
		//	foreach (GameObject go in LowerBallRet)
		//	{
		//		go.SetActive(false);
		//	}
		//}
		//else if (jawMaterial == 1) // Acrylic
		//{
		//	//Stage4_PanelControl.instance.MaterialSetting(true);
		//	//S4UI.MaterialSetting(1);

		//	//set colour to pink, all major connectors only
		//	//pink colour
		//	foreach (Transform t in BtmMajor)
		//	{
		//		t.GetComponent<Image>().color = Acrylic;
		//	}

		//	foreach (Transform t in TopMajor)
		//	{
		//		t.GetComponent<Image>().color = Acrylic;
		//	}

		//	//palatal bar
		//	PalatalBarGO.GetComponent<Image>().color = Acrylic;

		//	//palatalstrap
		//	PalatalStrapGO.GetComponent<UnityEngine.UI.Extensions.UIPolygonCustom>().color = Acrylic;

		//	//hole sprites
		//	Hole16.GetComponent<Image>().color = Acrylic;
		//	Hole17.GetComponent<Image>().color = Acrylic;
		//	Hole18.GetComponent<Image>().color = Acrylic;
		//	Hole26.GetComponent<Image>().color = Acrylic;
		//	Hole27.GetComponent<Image>().color = Acrylic;
		//	Hole28.GetComponent<Image>().color = Acrylic;
		//}
		//else if (jawMaterial == 2) // Full_Acrylic
		//{
		//	//Stage4_PanelControl.instance.MaterialSetting(true);
		//	//S4UI.MaterialSetting(2);

		//	//set colour to full acrylic color, all major connectors only
		//	foreach (Transform t in BtmMajor)
		//	{
		//		t.GetComponent<Image>().color = FullAcrylic;
		//	}

		//	foreach (Transform t in TopMajor)
		//	{
		//		t.GetComponent<Image>().color = FullAcrylic;
		//	}

		//	//palatal bar
		//	PalatalBarGO.GetComponent<Image>().color = FullAcrylic;

		//	//palatalstrap
		//	PalatalStrapGO.GetComponent<UnityEngine.UI.Extensions.UIPolygonCustom>().color = FullAcrylic;

		//	//hole sprites
		//	Hole16.GetComponent<Image>().color = FullAcrylic;
		//	Hole17.GetComponent<Image>().color = FullAcrylic;
		//	Hole18.GetComponent<Image>().color = FullAcrylic;
		//	Hole26.GetComponent<Image>().color = FullAcrylic;
		//	Hole27.GetComponent<Image>().color = FullAcrylic;
		//	Hole28.GetComponent<Image>().color = FullAcrylic;
		//}
	}

}
