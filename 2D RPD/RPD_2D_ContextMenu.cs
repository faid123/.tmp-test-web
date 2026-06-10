using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using TMPro;

public class RPD_2D_ContextMenu : MonoBehaviour
{
	[SerializeField]
	TMP_Text labelText;

	GenericTooth SelectedTooth;
	public RPD_2DComponent.componentType SelectedComponent;
	public RPDComponent selectedComponent;

	public GameObject BallRetainer;
	
	public GameObject SingleMeshBtn;

	//public Image CloseContextMenuCatcher;

	/// <summary>
	/// Legacy function. Saves the current selected tooth and component information for context menu
	/// </summary>
	/// <param name="tooth">Input of GenericTooth</param>
	/// <param name="component"></param>
	public void SetTooth(GenericTooth tooth, RPD_2DComponent.componentType component)
	{
		SelectedTooth = tooth;
		SelectedComponent = component;
	}
	/// <summary>
	/// Saves the current selected tooth and component information for context menu
	/// </summary>
	/// <param name="tooth">Input of GenericTooth</param>
	/// <param name="component">Input of RPDComponent</param>
	public void SetTooth(GenericTooth tooth, RPDComponent component)
	{
		SelectedTooth = tooth;
		selectedComponent = component;
	}
	/// <summary>
	/// Sets the UI text for the context menu to show the relevant text
	/// </summary>
	/// <param name="newText">Input of text string to display</param>
	public void SetLabelText(string newText)
	{
		labelText.text = newText;
	}
	/// <summary>
	/// Handles the calling of the removal of the selected component from the selected tooth
	/// </summary>
	public void RemoveComponent()
	{
		CloseMenu();

		if (RPDManager.instance.useNew2DSystem)
		{
			Logger.Log(TypeLog.RPD2D, "Deleting Component " + SelectedTooth + selectedComponent.displayName);

			RPDManager.instance.RemoveComponent(selectedComponent, SelectedTooth.ToothIndex);

			this.transform.position = new Vector3(-1000, 0, 0);

			return;
		}


		if (SelectedTooth != null && SelectedComponent != RPD_2DComponent.componentType.TypeNull)
		{
			Logger.Log(TypeLog.RPD2D, "Deleting Component " + SelectedTooth + SelectedComponent);
			SelectedTooth.RemoveComponent(SelectedComponent);
		}
		else if (SelectedComponent == RPD_2DComponent.componentType.r_ball)
		{
			Logger.Log(TypeLog.RPD2D, "Deleting Component " + SelectedComponent);
			//"deleted" ball component (disable game object)
			//how to find the component and what is its game object?
			BallRetainer.SetActive(false);
		}
		//this.transform.position = new Vector3(-1000, 0, 0);
	}
	/// <summary>
	/// Handles the calling of the removal of the selected singular mesh piece from the selected tooth
	/// </summary>
	public void RemoveMeshOnlyFromThisTooth()
	{
        CloseMenu();

        if (RPDManager.instance.useNew2DSystem)
		{
			Logger.Log(TypeLog.RPD2D, "Deleting Component " + SelectedTooth + selectedComponent.displayName);

			RPDManager.instance.RemoveComponentSpecial(selectedComponent, SelectedTooth.ToothIndex);

			this.transform.position = new Vector3(-1000, 0, 0);
			return;
		}

		if (Constants.Components.Meshes.ContainsComponent(SelectedComponent))
		{
			if (SelectedTooth != null && SelectedComponent != RPD_2DComponent.componentType.TypeNull)
			{
				Logger.Log(TypeLog.RPD2D, "Deleting Component " + SelectedTooth + SelectedComponent);
				SelectedTooth.RemoveComponent(SelectedComponent, removeMeshOnlyFromThisTooth: true);
			}
		}
		else
		{
			Logger.LogError(TypeLogError.General, "Unable to remove mesh only at this tooth's position. Mesh not present.");
		}

		this.transform.position = new Vector3(-1000, 0, 0);
	}
	/// <summary>
	/// Handles the showing/hiding of additional Mesh delete button if mesh component is selected or not
	/// </summary>
	public void ShowMeshDeleteBtn()
	{
		if (RPDManager.instance.useNew2DSystem)
        {
			if (Constants.Components.Meshes.ContainsComponent(selectedComponent))
				SingleMeshBtn.SetActive(true);
			else
				SingleMeshBtn.SetActive(false);

			return;
        }

		if (Constants.Components.Meshes.ContainsComponent(SelectedComponent))
		{
			SingleMeshBtn.SetActive(true);
		}
		else
			SingleMeshBtn.SetActive(false);
	}
	/// <summary>
	/// Handles the closing of the context menu (by putting it off screen)
	/// </summary>
	public void CloseMenu()
	{
		this.transform.position = new Vector3(-1000, 0, 0);
		//CloseContextMenuCatcher.enabled = false;
		UI_PopupPanel.instance.TurnBlockerOff();
	}
	/// <summary>
	/// Unused, to help change the selected component (if it is mesial) to the distal direction
	/// </summary>
	public void ChangeToDistal()
	{
		//SelectedTooth.RemoveComponent(RPD_2DComponent.componentType.p_mesial);
		//SelectedTooth.RemoveComponent(RPD_2DComponent.componentType.p_lingual);
		//SelectedTooth.SetComponent(RPD_2DComponent.componentType.p_distal);
		switch (SelectedComponent)
		{
			//Rest Molars
			case RPD_2DComponent.componentType.p_distal:
				break;
			case RPD_2DComponent.componentType.p_mesial:
				SelectedTooth.RemoveComponent(RPD_2DComponent.componentType.p_mesial);
				SelectedTooth.SetComponent(RPD_2DComponent.componentType.p_distal);
				break;
			case RPD_2DComponent.componentType.p_lingual:
				SelectedTooth.RemoveComponent(RPD_2DComponent.componentType.p_lingual);
				SelectedTooth.SetComponent(RPD_2DComponent.componentType.p_distal);
				break;
			//Rest Cingulum
			case RPD_2DComponent.componentType.ac_mesial:
				SelectedTooth.RemoveComponent(RPD_2DComponent.componentType.ac_mesial);
				SelectedTooth.SetComponent(RPD_2DComponent.componentType.ac_distal);
				break;
			case RPD_2DComponent.componentType.ac_distal:
				break;
			//Rest Incisor
			case RPD_2DComponent.componentType.ai_mesial:
				SelectedTooth.RemoveComponent(RPD_2DComponent.componentType.ai_mesial);
				SelectedTooth.SetComponent(RPD_2DComponent.componentType.ai_distal);
				break;
			case RPD_2DComponent.componentType.ai_distal:
				break;
			//Retainer Clasp
			case RPD_2DComponent.componentType.rc_mesiobuccal:
				SelectedTooth.RemoveComponent(RPD_2DComponent.componentType.rc_mesiobuccal);
				SelectedTooth.SetComponent(RPD_2DComponent.componentType.rc_distobuccal);
				break;
			case RPD_2DComponent.componentType.rc_mesiolingual:
				SelectedTooth.RemoveComponent(RPD_2DComponent.componentType.rc_mesiolingual);
				SelectedTooth.SetComponent(RPD_2DComponent.componentType.rc_distolingual);
				break;
			case RPD_2DComponent.componentType.rc_distobuccal:
				break;
			case RPD_2DComponent.componentType.rc_distolingual:
				break;
			//Retainer Ring
			case RPD_2DComponent.componentType.rr_mesiobuccal:
				SelectedTooth.RemoveComponent(RPD_2DComponent.componentType.rr_mesiobuccal);
				SelectedTooth.SetComponent(RPD_2DComponent.componentType.rr_distobuccal);
				break;
			case RPD_2DComponent.componentType.rr_mesiolingual:
				SelectedTooth.RemoveComponent(RPD_2DComponent.componentType.rr_mesiolingual);
				SelectedTooth.SetComponent(RPD_2DComponent.componentType.rr_distolingual);
				break;
			case RPD_2DComponent.componentType.rr_distobuccal:
				break;
			case RPD_2DComponent.componentType.rr_distolingual:
				break;

			default:
				break;
		}
	}
	/// <summary>
	/// Unused, to help change the selected component (if it is mesial) to the mesial direction
	/// </summary>
	public void ChangeToMesial()
	{
		//SelectedTooth.RemoveComponent(RPD_2DComponent.componentType.p_distal);
		//SelectedTooth.RemoveComponent(RPD_2DComponent.componentType.p_lingual);
		//SelectedTooth.SetComponent(RPD_2DComponent.componentType.p_mesial);

		switch (SelectedComponent)
		{
			//Rest Molars
			case RPD_2DComponent.componentType.p_mesial:
				break;
			case RPD_2DComponent.componentType.p_distal:
				SelectedTooth.RemoveComponent(RPD_2DComponent.componentType.p_distal);
				SelectedTooth.SetComponent(RPD_2DComponent.componentType.p_mesial);
				break;
			case RPD_2DComponent.componentType.p_lingual:
				SelectedTooth.RemoveComponent(RPD_2DComponent.componentType.p_lingual);
				SelectedTooth.SetComponent(RPD_2DComponent.componentType.p_mesial);
				break;
			//Rest Cingulum
			case RPD_2DComponent.componentType.ac_distal:
				SelectedTooth.RemoveComponent(RPD_2DComponent.componentType.ac_distal);
				SelectedTooth.SetComponent(RPD_2DComponent.componentType.ac_mesial);
				break;
			case RPD_2DComponent.componentType.ac_mesial:
				break;
			//Rest Incisor
			case RPD_2DComponent.componentType.ai_distal:
				SelectedTooth.RemoveComponent(RPD_2DComponent.componentType.ai_distal);
				SelectedTooth.SetComponent(RPD_2DComponent.componentType.ai_mesial);
				break;
			case RPD_2DComponent.componentType.ai_mesial:
				break;
			//Retainer Clasp
			case RPD_2DComponent.componentType.rc_distobuccal:
				SelectedTooth.RemoveComponent(RPD_2DComponent.componentType.rc_distobuccal);
				SelectedTooth.SetComponent(RPD_2DComponent.componentType.rc_mesiobuccal);
				break;
			case RPD_2DComponent.componentType.rc_distolingual:
				SelectedTooth.RemoveComponent(RPD_2DComponent.componentType.rc_distolingual);
				SelectedTooth.SetComponent(RPD_2DComponent.componentType.rc_mesiolingual);
				break;
			case RPD_2DComponent.componentType.rc_mesiobuccal:
				break;
			case RPD_2DComponent.componentType.rc_mesiolingual:
				break;
			//Retainer Ring
			case RPD_2DComponent.componentType.rr_distobuccal:
				SelectedTooth.RemoveComponent(RPD_2DComponent.componentType.rr_distobuccal);
				SelectedTooth.SetComponent(RPD_2DComponent.componentType.rr_mesiobuccal);
				break;
			case RPD_2DComponent.componentType.rr_distolingual:
				SelectedTooth.RemoveComponent(RPD_2DComponent.componentType.rr_distolingual);
				SelectedTooth.SetComponent(RPD_2DComponent.componentType.rr_mesiolingual);
				break;
			case RPD_2DComponent.componentType.rr_mesiobuccal:
				break;
			case RPD_2DComponent.componentType.rr_mesiolingual:
				break;

			default:
				break;
		}
	}

	/* public void ChangeToLingual()
	 {
		 //SelectedTooth.RemoveComponent(SelectedComponent);
		 //SelectedTooth.RemoveComponent(RPD_2DComponent.componentType.p_mesial);
		 //SelectedTooth.RemoveComponent(RPD_2DComponent.componentType.p_distal);
		 //SelectedTooth.SetComponent(RPD_2DComponent.componentType.p_lingual);
		 switch (SelectedComponent)
		 {
			 //Rest
			 case RPD_2DComponent.componentType.p_lingual:
				 return;
			 case RPD_2DComponent.componentType.p_distal:
				 SelectedTooth.RemoveComponent(RPD_2DComponent.componentType.p_distal);
				 SelectedTooth.SetComponent(RPD_2DComponent.componentType.p_lingual);
				 break;
			 case RPD_2DComponent.componentType.p_mesial:
				 SelectedTooth.RemoveComponent(RPD_2DComponent.componentType.p_mesial);
				 SelectedTooth.SetComponent(RPD_2DComponent.componentType.p_lingual);
				 break;

			 //Retainer Ring
			 case RPD_2DComponent.componentType.rc_distobuccal:
				 SelectedTooth.RemoveComponent(RPD_2DComponent.componentType.rc_distobuccal);
				 SelectedTooth.SetComponent(RPD_2DComponent.componentType.rc_distolingual);
				 break;
			 case RPD_2DComponent.componentType.rc_mesiobuccal:
				 SelectedTooth.RemoveComponent(RPD_2DComponent.componentType.rc_mesiobuccal);
				 SelectedTooth.SetComponent(RPD_2DComponent.componentType.rc_mesiolingual);
				 break;
			 case RPD_2DComponent.componentType.rc_distolingual:
				 break;
			 case RPD_2DComponent.componentType.rc_mesiolingual:
				 break;

			 //Retainer Ring
			 case RPD_2DComponent.componentType.rr_distobuccal:
				 SelectedTooth.RemoveComponent(RPD_2DComponent.componentType.rr_distobuccal);
				 SelectedTooth.SetComponent(RPD_2DComponent.componentType.rr_distolingual);
				 break;
			 case RPD_2DComponent.componentType.rr_mesiobuccal:
				 SelectedTooth.RemoveComponent(RPD_2DComponent.componentType.rr_mesiobuccal);
				 SelectedTooth.SetComponent(RPD_2DComponent.componentType.rr_mesiolingual);
				 break;
			 case RPD_2DComponent.componentType.rr_distolingual:
				 break;
			 case RPD_2DComponent.componentType.rr_mesiolingual:
				 break;


			 default:
				 break;
		 }
	 }*/
}
