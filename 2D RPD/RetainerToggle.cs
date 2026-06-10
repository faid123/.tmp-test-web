using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using UnityEngine;
using UnityEngine.UI;

public class RetainerToggle : MonoBehaviour
{
	[SerializeField]
	List<GameObject> RetainerButton = new List<GameObject>();

	//[SerializeField]
	//Toggle Acrylic;
	//[SerializeField]
	//Toggle Metal;

	GenericTooth generic;

	public void Start()
	{
		//Acrylic = GameObject.Find("Togg_Acrylic").GetComponent<Toggle>();
		//Metal = GameObject.Find("Togg_Metal").GetComponent<Toggle>();
		generic = transform.parent.GetChild(0).GetComponent<GenericTooth>();
	}
	/// <summary>
	/// Handles the turning ON of UI of the Retainer placement buttons
	/// </summary>
	public void TurnOn()
	{
		foreach (var btn in RetainerButton)
		{
			RPDComponent rpdComponent = UI_Component_Click.instance.currentComponent;
			if (rpdComponent != null)
			{
				if (rpdComponent.AssessCriteria(new PlacementData(rpdComponent, generic.ToothIndex, rpdComponent), out _))
				{
					if (!btn.activeSelf)
					{
						btn.SetActive(true);
					}
				}
				else
				{
					if (btn.activeSelf)
					{
						btn.SetActive(false);
					}
				}
				continue;
			}


			if (gameObject.name.Contains("Ball"))// && Acrylic.isOn)
			{
				if (!btn.activeSelf)
				{
					btn.SetActive(true);
				}
			}

			if (generic != null && generic.presence == Tooth_Presence.present)
			{
				//component is reciprocating clasp
				if (gameObject.name.Contains("Recip"))
				{
					//check if tooth have clasps on the component
					if (generic.HasComponent(RPD_2DComponent.componentType.rc_distobuccal)
						|| generic.HasComponent(RPD_2DComponent.componentType.rc_mesiobuccal)
						|| generic.HasComponent(RPD_2DComponent.componentType.rb_I_distal)
						|| generic.HasComponent(RPD_2DComponent.componentType.rb_I_mesial)
						|| generic.HasComponent(RPD_2DComponent.componentType.rb_Y_distal)
						|| generic.HasComponent(RPD_2DComponent.componentType.rb_Y_mesial)
						|| generic.HasComponent(RPD_2DComponent.componentType.rb_U_distal)
						|| generic.HasComponent(RPD_2DComponent.componentType.rb_U_mesial)
						|| generic.HasComponent(RPD_2DComponent.componentType.rb_T_distal)
						|| generic.HasComponent(RPD_2DComponent.componentType.rb_T_mesial)
						|| generic.HasComponent(RPD_2DComponent.componentType.rb_S_distal)
						|| generic.HasComponent(RPD_2DComponent.componentType.rb_S_mesial))
					{
						if (btn.name.Contains("lingual"))
						{
							if (!btn.activeSelf)
							{
								btn.SetActive(true);
							}
						}

						else
						{
							if (btn.activeSelf)
							{
								btn.SetActive(false);
							}
						}
					}

					if (generic.HasComponent(RPD_2DComponent.componentType.rc_distolingual)
						|| generic.HasComponent(RPD_2DComponent.componentType.rc_mesiolingual))
					{
						if (btn.name.Contains("buccal"))
						{
							if (!btn.activeSelf)
							{
								btn.SetActive(true);
							}
						}

						else
						{
							if (btn.activeSelf)
							{
								btn.SetActive(false);
							}
						}
					}
				}

				else
				{
					//TODO: check how dynamic this needs to be, cos this seems like it doesnt account for when material changes
					if (DLLIntegration.instance.jUpper.jaw_material == 2 && btn.name.Contains("Acrylic"))
					{
						//TODO: placeholder since there are no full acrylic buttons yet
						if (!btn.activeSelf)
						{
							btn.SetActive(true);
						}
					}

					if (DLLIntegration.instance.jUpper.jaw_material == 1 && btn.name.Contains("Acrylic"))
					{
						if (!btn.activeSelf)
						{
							btn.SetActive(true);
						}
					}

					else if (DLLIntegration.instance.jUpper.jaw_material == 0 && btn.name.Contains("Metal"))
					{
						if (!btn.activeSelf)
						{
							btn.SetActive(true);
						}
					}
				}
			}

		}
	}

	/// <summary>
	/// Handles the turning OFF of UI of the Retainer placement buttons
	/// </summary>
	public void TurnOff()
	{
		RetainerButton.ForEach(btn => btn.SetActive(false));
	}

}
