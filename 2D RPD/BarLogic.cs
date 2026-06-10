using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using System.Linq;

[System.Serializable]
public class ToothInfo
{
	public List<int> ToothID = new List<int>();
	public RPD_2DComponent.componentType Component;
}

public class BarLogic : MonoBehaviour
{
	public static BarLogic instance;

	[SerializeField]
	Transform StartTooth, EndTooth;

	[SerializeField]
	public List<int> UpperList = new List<int>();

	[SerializeField]
	public List<int> LowerList = new List<int>();

	[SerializeField]
	public GameObject UpJaw;

	[SerializeField]
	public GameObject BtmJaw;

	[SerializeField]
	GameObject Instruction;


	[SerializeField]
	public List<ToothInfo> CurrentBarList = new List<ToothInfo>();

	[SerializeField]
	public List<ToothInfo> CurrentMeshList = new List<ToothInfo>();

	private void Awake()
	{
		if (instance == null)
			instance = this;
		else
			Destroy(this);
	}

	private void Start()
	{
		MeshLogicSet = false;
	}

	/// <summary>
	/// Old system, Handles the logical setting of the bar component
	/// </summary>
	/// <param name="type">Input component of the Bar type</param>
	void SetBar(RPD_2DComponent.componentType type)
	{

		ToothInfo BInfo = new ToothInfo();
		BInfo.Component = type;
		//This is where the bar is going to rest on, where the tip is
		int first = int.Parse(StartTooth.transform.parent.name);
		//This is where the bar comes from
		int Second = int.Parse(EndTooth.transform.parent.name);

		Debug.LogError(first + " " + Second);

		bool isStart = false;

		if (first > 30) //lower
		{
			if ((first < 40 && Second < first) || (first < 40 && Second > 40))
			{
				Debug.LogError("Right to Left");
				//check jaw from right to left
				for (int i = LowerList.Count - 1; i != 0; i--)
				{
					int toothNum = LowerList[i];
					Debug.LogError(toothNum);
					if (toothNum == first) //this is where the bar tip is facing/resting on, originally first
					{
						if (type == RPD_2DComponent.componentType.rb_end_mesial)
							BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_distal);
						else if (type == RPD_2DComponent.componentType.rb_I_mesial)
							BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_I_distal);
						else if (type == RPD_2DComponent.componentType.rb_S_mesial)
							BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_S_distal);
						else if (type == RPD_2DComponent.componentType.rb_U_mesial)
							BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_U_distal);
						else if (type == RPD_2DComponent.componentType.rb_Y_mesial)
							BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_Y_distal);
						else if (type == RPD_2DComponent.componentType.rb_T_mesial)
							BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_T_distal);
						else if (type == RPD_2DComponent.componentType.rb_R_mesial)
							BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_R_distal);
						else
							BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(type);

						/*if (type == RPD_2DComponent.componentType.rb_end_distal)
                            BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_mesial);
                        else if (type == RPD_2DComponent.componentType.rb_I_distal)
                            BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_I_mesial);
                        else if (type == RPD_2DComponent.componentType.rb_S_distal)
                            BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_S_mesial);
                        else if (type == RPD_2DComponent.componentType.rb_U_distal)
                            BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_U_mesial);
                        else if (type == RPD_2DComponent.componentType.rb_Y_distal)
                            BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_Y_mesial);
                        else
                            BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(type);*/
						//BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_mesial);
						Debug.LogError(toothNum + "start Bar");
						isStart = true;

						BInfo.ToothID.Add(toothNum);
					}
					else if (toothNum == Second) //where the bar comes from, faces mesial direction, oginally second
					{
						BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_mesial);
						//BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_distal);
						Debug.LogError(toothNum + "End Bar");
						StartTooth = EndTooth = null;
						BInfo.ToothID.Add(toothNum);

						//remove duplicate on list
						foreach (var tooth in BInfo.ToothID)
							RemoveBarFromList(tooth, BInfo);

						CurrentBarList.Add(BInfo);
						return;
					}
					else if (isStart)
					{
						BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_mid);
						BInfo.ToothID.Add(toothNum);
						Debug.LogError(toothNum + "set straight bar");
					}
					else
					{
						Debug.LogError("Ignore");
					}
				}

			}
			else
			{
				Debug.LogError("Left to right");
				//left to right

				for (int i = 0; i < LowerList.Count; i++)
				{
					int toothNum = LowerList[i];

					if (toothNum == Second || toothNum == first)
					{
						if (!isStart)
						{
							if (toothNum == first)//originally first
							{
								if (first < Second)
								{
									if (type == RPD_2DComponent.componentType.rb_end_mesial)
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_distal);
									else if (type == RPD_2DComponent.componentType.rb_I_mesial)
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_I_distal);
									else if (type == RPD_2DComponent.componentType.rb_S_mesial)
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_S_distal);
									else if (type == RPD_2DComponent.componentType.rb_U_mesial)
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_U_distal);
									else if (type == RPD_2DComponent.componentType.rb_Y_mesial)
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_Y_distal);
									else if (type == RPD_2DComponent.componentType.rb_T_mesial)
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_T_distal);
									else if (type == RPD_2DComponent.componentType.rb_R_mesial)
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_R_distal);
									else
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(type);

									BInfo.ToothID.Add(toothNum);
								}
								else
								{
									if (type == RPD_2DComponent.componentType.rb_end_distal)
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_mesial);
									else if (type == RPD_2DComponent.componentType.rb_I_distal)
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_I_mesial);
									else if (type == RPD_2DComponent.componentType.rb_S_distal)
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_S_mesial);
									else if (type == RPD_2DComponent.componentType.rb_U_distal)
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_U_mesial);
									else if (type == RPD_2DComponent.componentType.rb_Y_distal)
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_Y_mesial);
									else if (type == RPD_2DComponent.componentType.rb_T_distal)
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_T_mesial);
									else if (type == RPD_2DComponent.componentType.rb_R_distal)
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_R_mesial);
									else
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(type);
									BInfo.ToothID.Add(toothNum);
								}

							}

							else
							{
								if (first < Second)
									BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_mesial);
								else
									BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_distal);

								BInfo.ToothID.Add(toothNum);
							}

							Debug.LogError(toothNum + "start Bar");
							isStart = true;
							continue;
						}
						else
						{
							if (toothNum == first) //originally first
							{
								if (first < Second)
								{
									if (type == RPD_2DComponent.componentType.rb_end_mesial)
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_distal);
									else if (type == RPD_2DComponent.componentType.rb_I_mesial)
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_I_distal);
									else if (type == RPD_2DComponent.componentType.rb_S_mesial)
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_S_distal);
									else if (type == RPD_2DComponent.componentType.rb_U_mesial)
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_U_distal);
									else if (type == RPD_2DComponent.componentType.rb_Y_mesial)
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_Y_distal);
									else if (type == RPD_2DComponent.componentType.rb_T_mesial)
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_T_distal);
									else if (type == RPD_2DComponent.componentType.rb_R_mesial)
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_R_distal);
									else
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(type);

									BInfo.ToothID.Add(toothNum);
								}
								else
								{
									if (type == RPD_2DComponent.componentType.rb_end_distal)
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_mesial);
									else if (type == RPD_2DComponent.componentType.rb_I_distal)
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_I_mesial);
									else if (type == RPD_2DComponent.componentType.rb_S_distal)
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_S_mesial);
									else if (type == RPD_2DComponent.componentType.rb_U_distal)
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_U_mesial);
									else if (type == RPD_2DComponent.componentType.rb_Y_distal)
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_Y_mesial);
									else if (type == RPD_2DComponent.componentType.rb_T_distal)
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_T_mesial);
									else if (type == RPD_2DComponent.componentType.rb_R_distal)
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_R_mesial);
									else
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(type);

									BInfo.ToothID.Add(toothNum);
								}
							}
							else
							{

								if (first == 31 && Second == 41)
								{
									BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_distal);
								}

								else if (first == 41 && Second == 31)
								{
									BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_mesial);
								}

								else
								{
									if (first < Second)
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_mesial);
									else
										BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_distal);
								}
							}

							BInfo.ToothID.Add(toothNum);
							Debug.LogError(toothNum + "End Bar");
							StartTooth = EndTooth = null;

							//remove duplicate on list
							foreach (var tooth in BInfo.ToothID)
								RemoveBarFromList(tooth, BInfo);

							CurrentBarList.Add(BInfo);
							return;
						}
					}
					else if (isStart)
					{
						BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_mid);
						BInfo.ToothID.Add(toothNum);
						Debug.LogError(toothNum + "set straight bar");
					}
					else
					{
						Debug.LogError("Ignore");
					}
				}
			}
		}

		else // upper
		{
			if ((first < 20 && Second < first) || (first < 20 && Second > 20))
			{
				Debug.LogError("Right to Left");
				//right to left
				for (int i = UpperList.Count - 1; i != 0; i--)
				{
					int toothNum = UpperList[i];

					Debug.LogError(toothNum);
					if (toothNum == Second)
					{
						//UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_mesial);
						UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_distal);
						//BtmJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_mesial);

						//where the bar comes from
						Debug.LogError(toothNum + "start Bar");
						isStart = true;

						BInfo.ToothID.Add(toothNum);
					}
					else if (toothNum == first)
					{

						if (type == RPD_2DComponent.componentType.rb_end_distal)
							UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_mesial);
						else if (type == RPD_2DComponent.componentType.rb_I_distal)
							UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_I_mesial);
						else if (type == RPD_2DComponent.componentType.rb_S_distal)
							UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_S_mesial);
						else if (type == RPD_2DComponent.componentType.rb_U_distal)
							UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_U_mesial);
						else if (type == RPD_2DComponent.componentType.rb_Y_distal)
							UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_Y_mesial);
						else if (type == RPD_2DComponent.componentType.rb_T_distal)
							UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_T_mesial);
						else if (type == RPD_2DComponent.componentType.rb_R_distal)
							UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_R_mesial);
						else
							UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(type);

						//where the bar tip is at to support the tooth
						Debug.LogError(toothNum + "End Bar");
						StartTooth = EndTooth = null;
						BInfo.ToothID.Add(toothNum);

						//remove duplicate on list
						foreach (var tooth in BInfo.ToothID)
							RemoveBarFromList(tooth, BInfo);

						CurrentBarList.Add(BInfo);
						return;
					}
					else if (isStart)
					{
						UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_mid);
						BInfo.ToothID.Add(toothNum);
						Debug.LogError(toothNum + "set straight bar");
					}
					else
					{
						Debug.LogError("Ignore");
					}
				}

			}
			else
			{
				Debug.LogError("Left to right");
				//left to right

				for (int i = 0; i < UpperList.Count; i++)
				{
					int toothNum = UpperList[i];

					if (toothNum == Second || toothNum == first)
					{
						if (!isStart)
						{
							if (toothNum == first)
							{
								if (first < Second)
								{
									if (type == RPD_2DComponent.componentType.rb_end_mesial)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_distal);
									else if (type == RPD_2DComponent.componentType.rb_I_mesial)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_I_distal);
									else if (type == RPD_2DComponent.componentType.rb_S_mesial)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_S_distal);
									else if (type == RPD_2DComponent.componentType.rb_U_mesial)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_U_distal);
									else if (type == RPD_2DComponent.componentType.rb_Y_mesial)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_Y_distal);
									else if (type == RPD_2DComponent.componentType.rb_T_mesial)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_T_distal);
									else if (type == RPD_2DComponent.componentType.rb_R_mesial)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_R_distal);
									else
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(type);

									BInfo.ToothID.Add(toothNum);
								}
								else
								{
									if (type == RPD_2DComponent.componentType.rb_end_distal)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_mesial);
									else if (type == RPD_2DComponent.componentType.rb_I_distal)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_I_mesial);
									else if (type == RPD_2DComponent.componentType.rb_S_distal)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_S_mesial);
									else if (type == RPD_2DComponent.componentType.rb_U_distal)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_U_mesial);
									else if (type == RPD_2DComponent.componentType.rb_Y_distal)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_Y_mesial);
									else if (type == RPD_2DComponent.componentType.rb_T_distal)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_T_mesial);
									else if (type == RPD_2DComponent.componentType.rb_R_distal)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_R_mesial);
									else
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(type);
									BInfo.ToothID.Add(toothNum);
								}
							}

							else
							{
								if (first == 11 && Second == 21)
								{
									UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_distal);
								}

								else if (first == 21 && Second == 11)
								{
									UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_mesial);
								}

								else
								{
									if (first < Second)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_mesial);
									else
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_distal);

									BInfo.ToothID.Add(toothNum);
								}
							}


							//where the bar's tip is on the tooth to support)
							Debug.LogError(toothNum + "start Bar");
							isStart = true;
							continue;
						}
						else
						{
							if (toothNum == first)
							{
								if (first < Second)
								{
									if (type == RPD_2DComponent.componentType.rb_end_mesial)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_distal);
									else if (type == RPD_2DComponent.componentType.rb_I_mesial)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_I_distal);
									else if (type == RPD_2DComponent.componentType.rb_S_mesial)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_S_distal);
									else if (type == RPD_2DComponent.componentType.rb_U_mesial)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_U_distal);
									else if (type == RPD_2DComponent.componentType.rb_Y_mesial)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_Y_distal);
									else if (type == RPD_2DComponent.componentType.rb_T_mesial)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_T_distal);
									else if (type == RPD_2DComponent.componentType.rb_R_mesial)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_R_distal);
									else
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(type);

									BInfo.ToothID.Add(toothNum);
								}
								else
								{
									if (type == RPD_2DComponent.componentType.rb_end_distal)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_mesial);
									else if (type == RPD_2DComponent.componentType.rb_I_distal)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_I_mesial);
									else if (type == RPD_2DComponent.componentType.rb_S_distal)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_S_mesial);
									else if (type == RPD_2DComponent.componentType.rb_U_distal)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_U_mesial);
									else if (type == RPD_2DComponent.componentType.rb_Y_distal)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_Y_mesial);
									else if (type == RPD_2DComponent.componentType.rb_T_distal)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_T_mesial);
									else if (type == RPD_2DComponent.componentType.rb_R_distal)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_R_mesial);
									else
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(type);

									BInfo.ToothID.Add(toothNum);
								}
							}
							else
							{
								if (first == 11 && Second == 21)
								{
									UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_distal);
								}

								else if (first == 21 && Second == 11)
								{
									UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_mesial);
								}

								else
								{
									if (first < Second)
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_mesial);
									else
										UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_end_distal);
								}
							}

							//where the bar comes from
							BInfo.ToothID.Add(toothNum);
							Debug.LogError(toothNum + "End Bar");
							StartTooth = EndTooth = null;

							//remove duplicate on list
							foreach (var tooth in BInfo.ToothID)
								RemoveBarFromList(tooth, BInfo);

							CurrentBarList.Add(BInfo);
							return;
						}
					}
					else if (isStart)
					{
						UpJaw.transform.Find(toothNum.ToString()).GetChild(0).GetComponent<GenericTooth>().SetComponent(RPD_2DComponent.componentType.rb_mid);
						BInfo.ToothID.Add(toothNum);
						Debug.LogError(toothNum + "set straight bar");
					}
					else
					{
						Debug.LogError("Ignore");
					}
				}
			}
		}

		StartTooth = EndTooth = null;
	}

	int Left, Right;
	/// <summary>
	/// Old system, handles the checking of bar cases where it just crosses from one side of the jaw to the other
	/// </summary>
	/// <param name="ToothName">Input of tooth index</param>
	/// <returns></returns>
	public bool CheckBar(int ToothName)
	{
		int index = LowerList.IndexOf(ToothName);
		int upIndex = UpperList.IndexOf(ToothName);

		Left = Right = 0;
		if (ToothName > 30) //lower
		{

			if (index >= 1 && BtmJaw.transform.Find(LowerList[index - 1].ToString()).GetChild(0).GetComponent<GenericTooth>().CheckMeshPresent())
			{
				Left = 1;
			}
			else if (index >= 2 && BtmJaw.transform.Find(LowerList[index - 2].ToString()).GetChild(0).GetComponent<GenericTooth>().CheckMeshPresent())
			{
				Left = 2;
			}

			if (index <= LowerList.Count - 2 && BtmJaw.transform.Find(LowerList[index + 1].ToString()).GetChild(0).GetComponent<GenericTooth>().CheckMeshPresent())
			{
				Right = 1;
			}
			else if (index <= LowerList.Count - 3 && BtmJaw.transform.Find(LowerList[index + 2].ToString()).GetChild(0).GetComponent<GenericTooth>().CheckMeshPresent())
			{
				Right = 2;
			}
		}

		else //upper
		{
			if (upIndex >= 1 && UpJaw.transform.Find(UpperList[upIndex - 1].ToString()).GetChild(0).GetComponent<GenericTooth>().CheckMeshPresent())
			{
				Left = 1;
			}
			else if (upIndex >= 2 && UpJaw.transform.Find(UpperList[upIndex - 2].ToString()).GetChild(0).GetComponent<GenericTooth>().CheckMeshPresent())
			{
				Left = 2;
			}

			if (upIndex <= UpperList.Count - 2 && UpJaw.transform.Find(UpperList[upIndex + 1].ToString()).GetChild(0).GetComponent<GenericTooth>().CheckMeshPresent())
			{
				Right = 1;
			}
			else if (upIndex <= UpperList.Count - 3 && UpJaw.transform.Find(UpperList[upIndex + 2].ToString()).GetChild(0).GetComponent<GenericTooth>().CheckMeshPresent())
			{
				Right = 2;
			}
		}


		if (Left == 0 && Right == 0)
			return false;
		else
			return true;
	}
	/// <summary>
	/// Old system, handles the checking of where the nearest mesh component is to the bar
	/// </summary>
	/// <param name="ToothName">Input of tooth index</param>
	/// <param name="type">Input of component Bar type</param>
	public void SetNearestBar(int ToothName, RPD_2DComponent.componentType type)
	{
		print(ToothName + "," + Left + "left" + "," + Right + "right");

		//this is right side of the jaw. let the bar prioritize Set from Right
		//Upper Jaw Right side is indexes 21 to 28. Lower Jaw Right side is indexes 31 to 38.
		if (ToothName > 20 && ToothName < 40) //ToothName > 20 && ToothName < 29 || ToothName > 30 && ToothName < 39) 
		{
			if ((Right <= Left && Right > 0) || (Right > 0 && Left == 0))
			{
				Debug.LogError("Right");
				SetBarRight(ToothName, type);
			}

			else if (Left > 0)
			{
				Debug.LogError("left");
				SetBarLeft(ToothName, type);
			}
		}

		else
		{
			if ((Left <= Right && Left > 0) || (Left > 0 && Right == 0))
			{
				Debug.LogError("left");
				SetBarLeft(ToothName, type);
			}

			else if (Right > 0)
			{
				Debug.LogError("Right");
				SetBarRight(ToothName, type);
			}
		}


		/*//this is left side of the jaw. let the bar prioritize Set from Left
        //Upper Jaw Left side is indexes 11 to 18. Lower Jaw Right side is indexes 41 to 48.
        if (ToothName < 20 || ToothName > 40)
        {
            if ((Left <= Right && Left > 0) || (Left > 0 && Right == 0))
            {
                Debug.LogError("left");
                SetBarLeft(ToothName, type);
            }

            else if (Right > 0)
            {
                Debug.LogError("Right");
                SetBarRight(ToothName, type);
            }
        }

        //this is right side of the jaw. let the bar prioritize Set from Right
        //Upper Jaw Right side is indexes 21 to 28. Lower Jaw Right side is indexes 31 to 38.
        else if (ToothName > 20 && ToothName < 40)
        {
            if ((Right <= Left && Right > 0) || (Right > 0 && Left == 0))
            {
                Debug.LogError("Right");
                SetBarRight(ToothName, type);
            }

            else if (Left > 0)
            {
                Debug.LogError("left");
                SetBarLeft(ToothName, type);
            }
        }

        else
        {
            //do nothing
        }*/
	}
	/// <summary>
	/// Handles the removal of the specified bar from the CurrentBarList
	/// </summary>
	/// <param name="toothIndex">Input of tooth index</param>
	/// <param name="selectedInfo">Input of ToothInfo</param>
	public void RemoveBarFromList(int toothIndex, ToothInfo selectedInfo)
	{
		ToothInfo SelectedBar = null;

		foreach (var bar in CurrentBarList)
		{
			foreach (var tooth in bar.ToothID)
			{
				if (tooth == toothIndex)
				{
					SelectedBar = bar;
				}
			}
		}

		if (SelectedBar == null)
			return;

		foreach (var tooth in SelectedBar.ToothID)
		{
			if (selectedInfo.ToothID.Contains(tooth) == false)
			{
				if (toothIndex > 30) //lower
				{
					BtmJaw.transform.Find(tooth.ToString()).GetChild(0).GetComponent<GenericTooth>().RemoveBar();
				}
				else
				{

					UpJaw.transform.Find(tooth.ToString()).GetChild(0).GetComponent<GenericTooth>().RemoveBar();
				}
			}
		}
		CurrentBarList.Remove(SelectedBar);
	}
	/// <summary>
	/// Handles the removal of the specific bar component from the tooth
	/// </summary>
	/// <param name="toothIndex">Input of tooth index</param>
	public void RemoveBar(int toothIndex)
	{
		ToothInfo SelectedBar = null;
		foreach (var bar in CurrentBarList)
		{
			foreach (var tooth in bar.ToothID)
			{
				if (tooth == toothIndex)
				{
					SelectedBar = bar;
				}
			}
		}

		if (SelectedBar != null)
		{
			if (toothIndex > 30) //lower
			{
				foreach (var tooth in SelectedBar.ToothID)
				{
					BtmJaw.transform.Find(tooth.ToString()).GetChild(0).GetComponent<GenericTooth>().RemoveBar();
				}
			}
			else
			{
				foreach (var tooth in SelectedBar.ToothID)
				{
					UpJaw.transform.Find(tooth.ToString()).GetChild(0).GetComponent<GenericTooth>().RemoveBar();
				}
			}

			CurrentBarList.Remove(SelectedBar);
		}


		return;
	}

	/// <summary>
	/// New system, handles setting of bar component is coming from a mesh that is on the LEFT of the jaw and the tip is to the RIGHT
	/// </summary>
	/// <param name="ToothName">Input of tooth index</param>
	/// <param name="type">Input of component Bar type</param>
	// New SetBarLogic
	public void SetBarLeft(int ToothName, RPD_2DComponent.componentType type)
	{
		if (ToothName > 30) //lower
		{
			int index = LowerList.IndexOf(ToothName);
			if (index >= 1 && BtmJaw.transform.Find(LowerList[index - 1].ToString()).GetChild(0).GetComponent<GenericTooth>().CheckMeshPresent())
			{
				//set here
				StartTooth = BtmJaw.transform.Find(LowerList[index].ToString()).GetChild(0).transform;
				EndTooth = BtmJaw.transform.Find(LowerList[index - 1].ToString()).GetChild(0).transform;

				SetBar(type);
			}
			else if (index >= 2 && BtmJaw.transform.Find(LowerList[index - 2].ToString()).GetChild(0).GetComponent<GenericTooth>().CheckMeshPresent())
			{
				//set here
				StartTooth = BtmJaw.transform.Find(LowerList[index].ToString()).GetChild(0).transform;
				EndTooth = BtmJaw.transform.Find(LowerList[index - 2].ToString()).GetChild(0).transform;

				SetBar(type);
			}
			else
			{
				//nth to look here
				//SetBarRight(ToothName, type);
			}
		}
		else // upper
		{
			int index = UpperList.IndexOf(ToothName);
			if (index >= 1 && UpJaw.transform.Find(UpperList[index - 1].ToString()).GetChild(0).GetComponent<GenericTooth>().CheckMeshPresent())
			{
				//set here
				StartTooth = UpJaw.transform.Find(UpperList[index].ToString()).GetChild(0).transform;
				EndTooth = UpJaw.transform.Find(UpperList[index - 1].ToString()).GetChild(0).transform;

				SetBar(type);
			}
			else if (index >= 2 && UpJaw.transform.Find(UpperList[index - 2].ToString()).GetChild(0).GetComponent<GenericTooth>().CheckMeshPresent())
			{
				//set here
				StartTooth = UpJaw.transform.Find(UpperList[index].ToString()).GetChild(0).transform;
				EndTooth = UpJaw.transform.Find(UpperList[index - 2].ToString()).GetChild(0).transform;

				SetBar(type);
			}
			else
			{
				//nth to look here
				//SetBarRight(ToothName, type);
			}
		}
	}
	/// <summary>
	/// New system, handles setting of bar component is coming from a mesh that is on the RIGHT of the jaw and the tip is to the LEFT
	/// </summary>
	/// <param name="ToothName">Input of tooth index</param>
	/// <param name="type">Input of component Bar type</param>
	public void SetBarRight(int ToothName, RPD_2DComponent.componentType type)
	{
		if (ToothName > 30) //lower
		{
			int index = LowerList.IndexOf(ToothName);
			if (index <= LowerList.Count - 2 && BtmJaw.transform.Find(LowerList[index + 1].ToString()).GetChild(0).GetComponent<GenericTooth>().CheckMeshPresent())
			{
				//set here, right beside the tooth
				StartTooth = BtmJaw.transform.Find(LowerList[index].ToString()).GetChild(0).transform;
				EndTooth = BtmJaw.transform.Find(LowerList[index + 1].ToString()).GetChild(0).transform;

				SetBar(type);
			}
			else if (index <= LowerList.Count - 3 && BtmJaw.transform.Find(LowerList[index + 2].ToString()).GetChild(0).GetComponent<GenericTooth>().CheckMeshPresent())
			{
				//set here, one away from the tooth
				StartTooth = BtmJaw.transform.Find(LowerList[index].ToString()).GetChild(0).transform;
				EndTooth = BtmJaw.transform.Find(LowerList[index + 2].ToString()).GetChild(0).transform;

				SetBar(type);
			}
			else
			{
				//nth to look here
				//SetBarRight(ToothName);
			}
		}
		else // upper
		{
			int index = UpperList.IndexOf(ToothName);
			if (index <= UpperList.Count - 2 && UpJaw.transform.Find(UpperList[index + 1].ToString()).GetChild(0).GetComponent<GenericTooth>().CheckMeshPresent())
			{
				//set here, right beside the tooth
				StartTooth = UpJaw.transform.Find(UpperList[index].ToString()).GetChild(0).transform;
				EndTooth = UpJaw.transform.Find(UpperList[index + 1].ToString()).GetChild(0).transform;

				SetBar(type);
			}
			else if (index <= UpperList.Count - 3 && UpJaw.transform.Find(UpperList[index + 2].ToString()).GetChild(0).GetComponent<GenericTooth>().CheckMeshPresent())
			{
				//set here, one away from the tooth
				StartTooth = UpJaw.transform.Find(UpperList[index].ToString()).GetChild(0).transform;
				EndTooth = UpJaw.transform.Find(UpperList[index + 2].ToString()).GetChild(0).transform;

				SetBar(type);
			}
			else
			{
				//nth to look here
				//SetBarRight(ToothName);
			}
		}
	}

	// Mesh Logic

	public bool MeshLogicSet;
	/// <summary>
	/// Handles the logic of defining and setting of the mesh component on missing tooth areas
	/// </summary>
	/// <param name="toothIndex">Input of tooth index</param>
	/// <param name="type">Input of component Mesh type</param>
	public void DefineAndSetMesh(int toothIndex, RPD_2DComponent.componentType type)
	{
		/*
		first check if being placed on empty space (no pre existing mesh)
		
		if being placed on empty space
			use FindAdjacentEmptyTooth to get all empty teeth
			perform SetMesh on all of them with the current default code
		
		if being placed on an already placed mesh
			find all adjacent teeth with the same mesh that are connected to each other (on both sides)
			go through each of those teeth, set their mesh as the newly placed mesh (just call SetMesh)
			edit the CurrentMeshList info with the newly updated info
		*/


		ToothInfo info = new ToothInfo();
		info.Component = type;

		GameObject jawObj;

		if (toothIndex > 30) //lower
		{
			jawObj = BtmJaw;
		}
		else
		{
			jawObj = UpJaw;
		}

		List<int> adjacentEmptyTeethFDIIDs = FindAdjacentEmptyTooth(toothIndex);
		adjacentEmptyTeethFDIIDs = adjacentEmptyTeethFDIIDs.OrderBy(x => x).ToList();

		//check if current spot does not have any mesh already placed
		GenericTooth toothBeingSet = jawObj.transform.Find(toothIndex.ToString()).GetChild(0).GetComponent<GenericTooth>();

		bool alreadyHasMeshSet = toothBeingSet.HasComponent(Constants.Components.Meshes);

		//set
		//if being placed on an empty spot
		if (!alreadyHasMeshSet)
		{
			foreach (int adjacentEmptyTeethFDIID in adjacentEmptyTeethFDIIDs)
			{
				jawObj.transform.Find(adjacentEmptyTeethFDIID.ToString()).GetChild(0).GetComponent<GenericTooth>().SetMesh(type);
				info.ToothID.Add(adjacentEmptyTeethFDIID);
			}
			
			//not sure why this was here in the previous code, seems to cause bugs
			//when placing mesh down on empty spots while there already is a mesh in
			//the current set of empty teeth being clicked on
			//foreach (int tooth in info.ToothID)
			//	RemoveMeshFromList(tooth, info);

			CurrentMeshList.Add(info);

			RemoveMeshListToothIDDuplicates(adjacentEmptyTeethFDIIDs, info);
		}
		else
		{
			ToothInfo meshToTakeOver = null;

			//find entry with the tooth that is being clicked on
			foreach(ToothInfo meshInfo in CurrentMeshList)
			{
				if (!meshInfo.ToothID.Contains(toothIndex))
					continue;

				meshToTakeOver = meshInfo;

				break;
			}

			//reassign mesh type
			meshToTakeOver.Component = type;

			//go through each of these entries, change their sprites
			foreach (int toothFDIID in meshToTakeOver.ToothID)
			{
				GenericTooth tooth = jawObj.transform.Find(toothFDIID.ToString()).GetChild(0).GetComponent<GenericTooth>();
				tooth.RemoveMesh();
				tooth.SetMesh(type);
			}
		}
	}
	/// <summary>
	/// Handles the checking of CurrentMeshList and checks if duplicates of the teeth exist
	/// if they do, remove them if they do not belong to the mesh tooth info provided in the "meshToothInfoToSkip" argument
	/// </summary>
	/// <param name="teethFDIIDs">Input of the List of Tooth FDI IDs</param>
	/// <param name="meshToothInfoToSkip">Input of ToothInfo</param>
	void RemoveMeshListToothIDDuplicates(List<int> teethFDIIDs, ToothInfo meshToothInfoToSkip)
	{
		//skip a mesh because these teeth should be assigned to the provided mesh

		//goes into each ToothInfo in CurrentMeshList and checks if duplicates of the teeth exist
		//if they do, remove them if they do not belong to the mesh tooth info provided in the "meshToothInfoToSkip" argument

		List<ToothInfo> emptyMeshToothInfos = new List<ToothInfo>();

		foreach (ToothInfo meshInfo in CurrentMeshList)
		{
			//we do not check the same mesh tooth info as the one provided in the argument
			if (meshInfo == meshToothInfoToSkip)
				continue;

			foreach (int toothFDIID in teethFDIIDs)
			{
				if (meshInfo.ToothID.Contains(toothFDIID))
				{
					meshInfo.ToothID.Remove(toothFDIID);
				}
			}

			//store empty mesh info for deletion later
			if (meshInfo.ToothID.Count == 0)
				emptyMeshToothInfos.Add(meshInfo);
		}

		//delete empty mesh info
		foreach (ToothInfo toRemove in emptyMeshToothInfos)
		{
			CurrentMeshList.Remove(toRemove);
		}
	}
	/// <summary>
	/// Handles the removal of Mesh from the CurrentMeshList
	/// </summary>
	/// <param name="toothIndex">Input of tooth index</param>
	/// <param name="info">Input of ToothInfo</param>
	public void RemoveMeshFromList(int toothIndex, ToothInfo info)
	{
		ToothInfo selectedInfo = null;
		foreach (var bar in CurrentMeshList)
		{
			foreach (var tooth in bar.ToothID)
			{
				if (tooth == toothIndex)
				{
					selectedInfo = bar;
				}
			}
		}

		if (selectedInfo == null)
			return;

		foreach (var tooth in info.ToothID)
		{
			if (selectedInfo.ToothID.Contains(tooth) == false)
			{
				if (toothIndex > 30) //lower
				{
					BtmJaw.transform.Find(tooth.ToString()).GetChild(0).GetComponent<GenericTooth>().RemoveMesh();
				}
				else
				{

					UpJaw.transform.Find(tooth.ToString()).GetChild(0).GetComponent<GenericTooth>().RemoveMesh();
				}
			}
		}
		CurrentMeshList.Remove(selectedInfo);
	}
	/// <summary>
	/// Handles the removal of the specific mesh component (linked mesh, can be across several tooth)
	/// </summary>
	/// <param name="toothIndex">Input of tooth index</param>
	public void RemoveMesh(int toothIndex)
	{
		ToothInfo SelectedMesh = null;
		foreach (var bar in CurrentMeshList)
		{
			foreach (var tooth in bar.ToothID)
			{
				if (tooth == toothIndex)
				{
					SelectedMesh = bar;
				}
			}
		}

		if (SelectedMesh != null)
		{
			if (toothIndex > 30) //lower
			{
				foreach (var tooth in SelectedMesh.ToothID)
				{
					BtmJaw.transform.Find(tooth.ToString()).GetChild(0).GetComponent<GenericTooth>().RemoveMesh();
				}
			}
			else
			{
				foreach (var tooth in SelectedMesh.ToothID)
				{
					UpJaw.transform.Find(tooth.ToString()).GetChild(0).GetComponent<GenericTooth>().RemoveMesh();
				}
			}
			CurrentMeshList.Remove(SelectedMesh);
		}
	}
	/// <summary>
	/// Handles the removal of a specific mesh component from one singular tooth area
	/// </summary>
	/// <param name="toothFDIID">Input of tooth index</param>
	public void RemoveMeshOnlyAt(int toothFDIID)
	{
		ToothInfo SelectedMesh = null;
		foreach (var bar in CurrentMeshList)
		{
			foreach (var tooth in bar.ToothID)
			{
				if (tooth == toothFDIID)
				{
					SelectedMesh = bar;
				}
			}
		}

		if (SelectedMesh != null)
		{
			if (toothFDIID > 30) //lower
			{
				foreach (var tooth in SelectedMesh.ToothID)
				{
					if (tooth == toothFDIID)
					{
						BtmJaw.transform.Find(tooth.ToString()).GetChild(0).GetComponent<GenericTooth>().RemoveMesh();
						break;
					}
				}
			}
			else
			{
				foreach (var tooth in SelectedMesh.ToothID)
				{
					if (tooth == toothFDIID)
					{
						UpJaw.transform.Find(tooth.ToString()).GetChild(0).GetComponent<GenericTooth>().RemoveMesh();
						break;
					}
				}
			}

			//TrySplitMeshToothID handles removal and splitting of CurrentMeshList entries
			//so no need for this here
			//SelectedMesh.ToothID.Remove(toothFDIID);

			if (SelectedMesh.ToothID.Count == 0)
				CurrentMeshList.Remove(SelectedMesh);
			else
				TrySplitMeshToothID();
		}
	}

	/// <summary>
	/// Tries to split tooth mesh, based on selected meshes
	/// </summary>
	void TrySplitMeshToothID()
	{
		for (int i = CurrentMeshList.Count - 1; i >= 0; i--)
		{
			ToothInfo selectedMesh = CurrentMeshList[i];

			//order toothIDs by universal ID to make sure teeth are all in sequence
			List<int> orderedToothIDs = Utils.OrderFDIIndexByUniversalID(selectedMesh.ToothID);

			//list containing FDI IDs of all teeth that are in continuity that have the same meshes applied to them
			List<int> continuity = new List<int>();

			for (int j = orderedToothIDs.Count - 1; j >= 0; j--)
			{
				int toothFDIID = orderedToothIDs[j];

				//check for continuity of teeth here by checking if they have mesh on that tooth ID
				//if continuity is broken, split them up
				GenericTooth tooth = DLLIntegration.instance.GetToothByIndex(toothFDIID);
				if (tooth.CheckMeshPresent())
				{
					continuity.Add(toothFDIID);
					continue;
				}
				else
				{
					//also check if this entry is the final tooth, if it is, then just remove it and keep the current entry
					//go through continuity list, create another ToothInfo as a new CurrentMeshList entry
					if (continuity.Count > 0 && j != 0)
					{
						//populate the new mesh info data structure
						ToothInfo newMeshInfo = new ToothInfo();
						newMeshInfo.Component = selectedMesh.Component;

						foreach (int toothID in continuity)
						{
							//populate the new mesh info data structure
							newMeshInfo.ToothID.Add(toothID);

							//remove the ID from the current list to prevent duplicates
							selectedMesh.ToothID.Remove(toothID);
						}

						CurrentMeshList.Add(newMeshInfo);
					}

					//reset continuity list after populating new mesh info with data
					continuity.Clear();

					//remove the current meshless tooth ID from the current mesh 
					selectedMesh.ToothID.Remove(toothFDIID);
				}
			}

			//after removing, check if current entry has no more meshes
			if (selectedMesh.ToothID.Count == 0)
			{
				//current entry does not have anymore meshes, remove it
				CurrentMeshList.Remove(selectedMesh);
			}
		}
	}
	/// <summary>
	/// Handles logic checking of adjacent tooth, if it is Missing
	/// </summary>
	/// <param name="toothIndex">Input of tooth index</param>
	/// <returns></returns>
	//find empty mesh
	List<int> FindAdjacentEmptyTooth(int toothIndex)
	{
		List<int> Tooth = new List<int>();

		Tooth.Add(toothIndex);

		if (toothIndex > 30) //lower
		{
			int index = LowerList.IndexOf(toothIndex);

			//loop left
			for (int i = index; i > 0; i--)
			{
				if (BtmJaw.transform.Find(LowerList[i].ToString()).GetChild(0).GetComponent<GenericTooth>().presence == Tooth_Presence.missing)
				{
					if (!Tooth.Contains(LowerList[i]))
						Tooth.Add(LowerList[i]);
					//Debug.LogError(LowerList[i]);
				}
				else
					break;
			}

			//loop right
			for (int i = index; i < LowerList.Count - 1; i++)
			{
				if (BtmJaw.transform.Find(LowerList[i].ToString()).GetChild(0).GetComponent<GenericTooth>().presence == Tooth_Presence.missing)
				{
					if (!Tooth.Contains(LowerList[i]))
						Tooth.Add(LowerList[i]);

					//Debug.LogError(LowerList[i]);
				}
				else
					break;
			}

		}
		else
		{
			int index = UpperList.IndexOf(toothIndex);

			//loop left
			for (int i = index; i > 0; i--)
			{
				if (index < 0)
					break;

				if (UpJaw.transform.Find(UpperList[i].ToString()).GetChild(0).GetComponent<GenericTooth>().presence == Tooth_Presence.missing)
				{
					if (!Tooth.Contains(UpperList[i]))
						Tooth.Add(UpperList[i]);
					Debug.LogError(UpperList[i]);
				}
				else
					break;
			}

			//loop right
			for (int i = index; i < UpperList.Count - 1; i++)
			{
				if (UpJaw.transform.Find(UpperList[i].ToString()).GetChild(0).GetComponent<GenericTooth>().presence == Tooth_Presence.missing)
				{
					if (!Tooth.Contains(UpperList[i]))
						Tooth.Add(UpperList[i]);

					//Debug.LogError(LowerList[i]);
				}
				else
					break;
			}

		}
		return Tooth;
	}

}
